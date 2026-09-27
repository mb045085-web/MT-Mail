import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, RefreshCcw, Mail, Inbox, CheckCircle, Trash2, AlertCircle, ChevronLeft, Plus, Shuffle, X } from 'lucide-react';

const API_BASE = 'https://api.mail.tm';

function App() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeMessage, setActiveMessage] = useState(null);
  
  // Modals
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  
  // Custom Email State
  const [availableDomains, setAvailableDomains] = useState([]);
  const [customUsername, setCustomUsername] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // Mobile responsive state
  const [mobileView, setMobileView] = useState('inbox'); // 'inbox' | 'reader'
  const [toastCode, setToastCode] = useState(null);
  
  const timerRef = useRef(null);

  useEffect(() => {
    const savedEmail = localStorage.getItem('mtmail_address');
    const savedToken = localStorage.getItem('mtmail_token');
    if (savedEmail && savedToken) {
      setEmail(savedEmail);
      setToken(savedToken);
      fetchMessages(savedToken);
    } else {
      generateNewEmail();
    }
  }, []);

  useEffect(() => {
    if (token) {
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        fetchMessages(token, true);
      }, 7000);
    }
    return () => clearInterval(timerRef.current);
  }, [token]);
  
  useEffect(() => {
    if (showCustomModal && availableDomains.length === 0) {
      axios.get(`${API_BASE}/domains`).then(res => {
         const domains = res.data['hydra:member'];
         setAvailableDomains(domains);
         if (domains.length > 0) {
             setCustomDomain(domains[0].domain);
         }
      }).catch(console.error);
    }
  }, [showCustomModal]);

  const generateNewEmail = async () => {
    setLoading(true);
    setEmail('');
    setToken('');
    setMessages([]);
    setActiveMessage(null);
    setMobileView('inbox');
    try {
      let domain = localStorage.getItem('mtmail_domain');
      if (!domain) {
        const domainRes = await axios.get(`${API_BASE}/domains`);
        domain = domainRes.data['hydra:member'][0].domain;
        localStorage.setItem('mtmail_domain', domain);
      }
      
      // Generate exactly 6 characters for the username
      const randomPrefix = Math.random().toString(36).substring(2, 8);
      const address = `${randomPrefix}@${domain}`;
      const password = 'mtmailpassword123';
      
      try {
        await axios.post(`${API_BASE}/accounts`, { address, password });
      } catch (postErr) {
        localStorage.removeItem('mtmail_domain');
        const freshDomainRes = await axios.get(`${API_BASE}/domains`);
        const freshDomain = freshDomainRes.data['hydra:member'][0].domain;
        localStorage.setItem('mtmail_domain', freshDomain);
        const freshAddress = `${randomPrefix}@${freshDomain}`;
        await axios.post(`${API_BASE}/accounts`, { address: freshAddress, password });
        return generateNewEmail(); 
      }
      
      const tokenRes = await axios.post(`${API_BASE}/token`, { address, password });
      const newToken = tokenRes.data.token;
      
      setEmail(address);
      setToken(newToken);
      setMessages([]);
      localStorage.setItem('mtmail_address', address);
      localStorage.setItem('mtmail_token', newToken);
    } catch (err) {
      console.error('Error generating email:', err);
    }
    setLoading(false);
  };
  
  const handleCreateCustom = async (e) => {
     e.preventDefault();
     if (!customUsername || !customDomain) return;
     setCustomLoading(true);
     setCustomError('');
     
     const cleanUser = customUsername.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
     if (cleanUser.length < 3 || cleanUser.length > 6) {
         setCustomError('Username must be 3 to 6 characters long');
         setCustomLoading(false);
         return;
     }
     
     const address = `${cleanUser}@${customDomain}`;
     const password = 'mtmailpassword123';
     
     try {
        await axios.post(`${API_BASE}/accounts`, { address, password });
        const tokenRes = await axios.post(`${API_BASE}/token`, { address, password });
        const newToken = tokenRes.data.token;
        
        setEmail(address);
        setToken(newToken);
        setMessages([]);
        setActiveMessage(null);
        setMobileView('inbox');
        localStorage.setItem('mtmail_address', address);
        localStorage.setItem('mtmail_token', newToken);
        setShowCustomModal(false);
        setCustomUsername('');
     } catch (err) {
        console.error('Error creating custom email', err);
        setCustomError(err.response?.data?.message || 'Username already taken or invalid!');
     }
     setCustomLoading(false);
  };

  const fetchMessages = async (currentToken, silent = false) => {
    if (!currentToken) return;
    if (!silent) setInboxLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/messages`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      setMessages(res.data['hydra:member']);
    } catch (err) {
      console.error('Error fetching messages:', err);
      if (err.response && (err.response.status === 401 || err.response.status === 404)) {
        generateNewEmail();
      }
    }
    if (!silent) setInboxLoading(false);
  };

  const handleMessageClick = async (msg) => {
    if (activeMessage?.id === msg.id && activeMessage.html) {
       setMobileView('reader');
       return;
    }
    
    setActiveMessage({ ...msg, isLoading: true });
    setMobileView('reader');
    
    try {
      const res = await axios.get(`${API_BASE}/messages/${msg.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const fullMsg = res.data;
      setActiveMessage(fullMsg);
      
      const textToSearch = ((fullMsg.subject || "") + " " + (fullMsg.text || "")).replace(/\n/g, " ");
      let extractedCode = null;
      
      const googleMatch = textToSearch.match(/G-\d{6}/i);
      if (googleMatch) extractedCode = googleMatch[0];
      
      if (!extractedCode) {
        const kwMatch = textToSearch.match(/(?:code|otp|pin|password|verification|confirm)[\s\S]{0,25}?\b(\d{4,8})\b/i);
        if (kwMatch) extractedCode = kwMatch[1];
      }
      
      if (!extractedCode) {
        const genericMatch = textToSearch.match(/\b(\d{5,8})\b/);
        if (genericMatch) extractedCode = genericMatch[1];
      }

      if (extractedCode) {
        navigator.clipboard.writeText(extractedCode);
        setToastCode(extractedCode);
        setTimeout(() => setToastCode(null), 4000);
      }
      
    } catch (err) {
      console.error('Error fetching details:', err);
    }
  };

  const copyToClipboard = () => {
    if (!email) return;
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      
      <AnimatePresence>
        {toastCode && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none px-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.8, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.8, y: -20 }}
              className="clean-glass bg-white/70 p-8 rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] flex flex-col items-center gap-4 border border-white max-w-sm w-full backdrop-blur-3xl text-center pointer-events-auto"
            >
              <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center shadow-sm border border-green-100">
                 <CheckCircle size={40} />
              </div>
              <div>
                <p className="font-black text-2xl text-gray-900 mb-1 tracking-tight">Code Copied!</p>
                <p className="text-gray-500 font-medium">Ready to paste anywhere</p>
              </div>
              <div className="mt-2 font-mono text-3xl font-black text-[#0A84FF] bg-[#0A84FF]/10 px-6 py-4 rounded-2xl border border-[#0A84FF]/20 shadow-inner w-full tracking-widest">
                 {toastCode}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {showCustomModal && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white p-6 md:p-8 rounded-[2rem] max-w-md w-full shadow-2xl relative"
            >
              <button 
                onClick={() => setShowCustomModal(false)}
                className="absolute top-5 right-5 p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"
              >
                <X size={20} />
              </button>
              
              <div className="w-16 h-16 bg-[#0A84FF]/10 text-[#0A84FF] rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-[#0A84FF]/20">
                <Plus size={32} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Custom Email</h3>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                Create a memorable email address of your choice.
              </p>
              
              <form onSubmit={handleCreateCustom} className="space-y-4 relative">
                 <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Username</label>
                    <input 
                      type="text" 
                      required
                      maxLength={6}
                      placeholder="e.g. maruf"
                      value={customUsername}
                      onChange={(e) => setCustomUsername(e.target.value)}
                      className="w-full bg-gray-50 px-4 py-3.5 rounded-xl border border-gray-200 focus:outline-none focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 font-bold text-gray-800 transition-all"
                    />
                 </div>
                 
                 <div className="relative">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Domain</label>
                    <div 
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className={`w-full bg-gray-50 px-4 py-3.5 rounded-xl border ${dropdownOpen ? 'border-[#0A84FF] ring-2 ring-[#0A84FF]/20' : 'border-gray-200'} font-bold text-gray-800 transition-all cursor-pointer flex justify-between items-center`}
                    >
                       <span>{customDomain ? `@${customDomain}` : 'Loading...'}</span>
                       <svg className={`w-5 h-5 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                    
                    <AnimatePresence>
                      {dropdownOpen && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] z-50 overflow-hidden"
                        >
                           {availableDomains.length === 0 && <div className="px-4 py-3 text-gray-500 text-sm font-medium">Loading domains...</div>}
                           {availableDomains.map(d => (
                              <div 
                                key={d.id}
                                onClick={() => { setCustomDomain(d.domain); setDropdownOpen(false); }}
                                className={`px-4 py-3.5 cursor-pointer text-sm font-bold transition-colors ${customDomain === d.domain ? 'bg-[#0A84FF]/10 text-[#0A84FF]' : 'text-gray-700 hover:bg-gray-50'}`}
                              >
                                @{d.domain}
                              </div>
                           ))}
                           {availableDomains.length === 1 && (
                              <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 font-bold uppercase tracking-wider text-center">
                                Currently 1 domain available from server
                              </div>
                           )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                 </div>
                 
                 {customError && (
                    <div className="bg-red-50 text-red-500 text-sm font-semibold p-3 rounded-xl border border-red-100 flex items-center gap-2">
                       <AlertCircle size={16} /> {customError}
                    </div>
                 )}
                 
                 <button 
                   type="submit"
                   disabled={customLoading || !customUsername}
                   className="w-full mt-4 py-4 rounded-xl font-bold text-white bg-[#0A84FF] hover:bg-[#007AFF] transition-colors shadow-lg shadow-[#0A84FF]/30 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   {customLoading ? <RefreshCcw className="animate-spin" size={20} /> : 'Create Custom Address'}
                 </button>
              </form>
              
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteModal && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white p-6 md:p-8 rounded-[2rem] max-w-sm w-full text-center shadow-2xl relative"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-red-100">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Address?</h3>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                Are you sure you want to permanently delete this email address? All current inbox messages will be lost forever.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteModal(false)} 
                  className="flex-1 py-3.5 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => { setShowDeleteModal(false); generateNewEmail(); }} 
                  className="flex-1 py-3.5 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-colors shadow-md shadow-red-500/20"
                >
                  Yes, Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="fixed top-0 left-0 right-0 z-40 clean-glass border-b border-white shadow-sm">
        <div className="w-full px-4 sm:px-6 py-4 flex justify-between items-center max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm flex items-center justify-center bg-white border border-gray-100">
               <img src="/mtmail.png" alt="MT" className="w-8 h-8 object-contain" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              MT<span className="text-[#0A84FF]">MAIL</span>
            </h1>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1000px] mx-auto px-4 sm:px-6 pt-28 pb-10 flex flex-col gap-6 md:gap-8">
        
        <div className={`text-center mt-2 mb-2 ${mobileView === 'reader' ? 'hidden md:block' : 'block'}`}>
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">
            Welcome to <span className="text-[#0A84FF]">MT MAIL</span>
          </h2>
          <p className="text-sm md:text-base font-medium text-gray-500 mt-2">Your Premium Disposable Email Service</p>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={`w-full mx-auto p-5 md:p-6 rounded-[2.5rem] clean-glass border border-white/60 shadow-sm ${mobileView === 'reader' ? 'hidden md:block' : 'block'}`}
        >
          <div className="flex flex-col gap-4">
            
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-5 md:pl-6 flex items-center pointer-events-none">
                <Mail className="text-gray-400" size={24} />
              </div>
              <input 
                type="text" 
                readOnly 
                value={email || (loading ? 'Generating...' : '')} 
                className="w-full rounded-2xl py-4 md:py-5 pl-12 md:pl-16 pr-16 md:pr-32 text-sm sm:text-base md:text-2xl font-bold md:font-semibold tracking-tight focus:outline-none transition-all inner-glass text-gray-900 placeholder:text-gray-400 bg-white/40"
              />
              <div className="absolute inset-y-0 right-2 flex items-center py-2">
                <button 
                  onClick={copyToClipboard}
                  className={`h-full px-4 rounded-xl font-bold text-sm transition-all active:scale-95 border backdrop-blur-md shadow-sm flex items-center gap-2 ${
                    copied 
                      ? 'bg-green-500/10 border-green-500/20 text-green-600' 
                      : 'bg-[#0A84FF]/10 hover:bg-[#0A84FF]/20 border-[#0A84FF]/20 text-[#0A84FF]'
                  }`}
                >
                  {copied ? <CheckCircle size={18}/> : <Copy size={18} />}
                  <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="flex gap-3 w-full">
               <button 
                 onClick={() => setShowCustomModal(true)} 
                 className="flex-1 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 p-3 md:p-4 rounded-2xl transition-all active:scale-95 inner-glass bg-white/40 hover:bg-white text-gray-700 font-semibold shadow-sm border border-white/50"
               >
                  <Plus size={20} className="text-[#0A84FF]" /> 
                  <span className="text-xs md:text-base">Custom</span>
               </button>
               <button 
                 onClick={generateNewEmail} 
                 className="flex-1 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 p-3 md:p-4 rounded-2xl transition-all active:scale-95 inner-glass bg-white/40 hover:bg-white text-gray-700 font-semibold shadow-sm border border-white/50"
               >
                  <Shuffle size={20} className="text-[#0A84FF]" /> 
                  <span className="text-xs md:text-base">Random</span>
               </button>
               <button 
                 onClick={() => setShowDeleteModal(true)} 
                 className="flex-1 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 p-3 md:p-4 rounded-2xl transition-all active:scale-95 inner-glass bg-white/40 hover:bg-red-50 text-gray-700 hover:text-red-500 font-semibold shadow-sm border border-white/50 group"
               >
                  <Trash2 size={20} className="text-red-400 group-hover:text-red-500 transition-colors" /> 
                  <span className="text-xs md:text-base">Delete</span>
               </button>
            </div>
            
          </div>
        </motion.div>

        <div className="flex flex-col md:flex-row gap-6 w-full mx-auto pb-10 flex-1 min-h-[500px]">
          
          <motion.div 
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0 }} 
            className={`w-full md:w-1/3 flex-col h-[600px] md:h-auto rounded-[2rem] overflow-hidden flex-shrink-0 clean-glass ${mobileView === 'reader' ? 'hidden md:flex' : 'flex'}`}
          >
            <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-white/40">
              <h3 className="text-xl font-bold flex items-center gap-2 tracking-tight">
                <Inbox size={22} className="text-[#0A84FF]" /> Inbox
              </h3>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => fetchMessages(token)}
                  className="p-1.5 rounded-full hover:bg-white/60 transition-colors text-gray-500 hover:text-[#0A84FF]"
                  title="Refresh Inbox"
                >
                  <RefreshCcw size={18} className={inboxLoading ? 'animate-spin text-[#0A84FF]' : ''} />
                </button>
                <span className="bg-[#0A84FF] text-white py-1 px-3 rounded-full text-xs font-bold shadow-sm">
                  {messages.length}
                </span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              <AnimatePresence>
                {messages.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center text-center space-y-3"
                  >
                    <div className="w-14 h-14 rounded-full flex items-center justify-center inner-glass">
                      <Inbox size={24} className="text-gray-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Inbox is empty</p>
                      <p className="text-xs mt-1 text-gray-500">Auto-refreshing every 7s</p>
                    </div>
                  </motion.div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      onClick={() => handleMessageClick(msg)}
                      className={`p-4 rounded-[1.25rem] cursor-pointer transition-all duration-200 shadow-sm border border-white/50 ${
                        activeMessage?.id === msg.id 
                          ? 'bg-[#0A84FF] text-white shadow-md' 
                          : 'inner-glass hover:bg-white'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className={`font-semibold text-sm truncate pr-2 ${activeMessage?.id === msg.id ? 'text-white' : 'text-gray-900'}`}>
                          {msg.from?.name || msg.from?.address || 'Unknown'}
                        </span>
                        <span className={`text-[10px] font-medium whitespace-nowrap px-2 py-0.5 rounded-full ${activeMessage?.id === msg.id ? 'bg-white/20' : 'bg-gray-100'}`}>
                          {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <p className={`text-xs font-medium truncate ${activeMessage?.id === msg.id ? 'text-blue-100' : 'text-gray-500'}`}>
                        {msg.subject || 'No Subject'}
                      </p>
                    </div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 10 }} 
            animate={{ opacity: 1, x: 0 }} 
            className={`w-full md:w-2/3 flex-col h-[600px] md:h-auto rounded-[2rem] overflow-hidden clean-glass ${mobileView === 'inbox' ? 'hidden md:flex' : 'flex'}`}
          >
            {activeMessage ? (
              <div className="flex flex-col h-full">
                <div className="p-4 md:p-6 border-b border-gray-200 bg-white/40">
                  <button 
                    onClick={() => setMobileView('inbox')} 
                    className="md:hidden mb-4 text-[#0A84FF] font-semibold flex items-center gap-1 -ml-1 bg-white/50 px-3 py-1.5 rounded-full w-max shadow-sm border border-white"
                  >
                    <ChevronLeft size={18} /> Back to Inbox
                  </button>
                  <h2 className="text-xl md:text-2xl font-bold mb-4 tracking-tight leading-snug">{activeMessage.subject}</h2>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#0A84FF] flex items-center justify-center text-white font-bold shadow-sm flex-shrink-0">
                      {(activeMessage.from?.name || activeMessage.from?.address || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-semibold truncate">{activeMessage.from?.address}</p>
                      <p className="text-xs font-medium text-gray-500 truncate">To: {email}</p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 p-4 md:p-6 overflow-y-auto custom-scrollbar bg-white/30">
                  {activeMessage.isLoading ? (
                     <div className="h-full flex items-center justify-center">
                        <RefreshCcw size={32} className="animate-spin text-[#0A84FF]" />
                     </div>
                  ) : (activeMessage.html && (typeof activeMessage.html === 'string' || activeMessage.html.length > 0)) ? (
                    <iframe 
                      srcDoc={typeof activeMessage.html === 'string' ? activeMessage.html : activeMessage.html[0]} 
                      className="w-full h-full min-h-[400px] rounded-xl bg-white border border-gray-100 shadow-sm" 
                      title="Email Body"
                    />
                  ) : (
                    <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed p-6 rounded-xl inner-glass text-gray-800 shadow-sm min-h-[400px]">
                      {activeMessage.text || 'No content'}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center inner-glass">
                  <Mail size={28} className="text-gray-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-gray-700">Select an email</h3>
                  <p className="text-xs mt-1 font-medium text-gray-500">Click on a message to read its contents</p>
                </div>
              </div>
            )}
          </motion.div>

        </div>
      </main>
      
    </div>
  );
}

export default App;
