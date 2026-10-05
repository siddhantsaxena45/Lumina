// frontend/src/pages/InterviewRunner.jsx
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useParams, useNavigate } from 'react-router-dom';
import { getSessionById, submitAnswer, endSession, socketUpdateSession, startSession } from '../features/sessions/sessionSlice';
import MonacoEditor from '@monaco-editor/react';
import { toast } from 'react-toastify';
import { io } from 'socket.io-client';
import Modal from '../components/Modal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

function formatTime(seconds) {
  if (seconds === null || isNaN(seconds) || seconds < 0) return "00:00";
  const safeSec = Math.min(seconds, 3600 * 99); 
  const m = Math.floor(safeSec / 60).toString().padStart(2, '0');
  const s = (Math.floor(safeSec) % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const SUPPORTED_LANGUAGES = [
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Python', value: 'python' },
  { label: 'Java', value: 'java' },
  { label: 'C++', value: 'cpp' },
  { label: 'Go', value: 'go' },
  { label: 'SQL', value: 'sql' },
  { label: 'Plain Text', value: 'plaintext' },
];

const ROLE_LANGUAGE_MAP = {
  "MERN Stack Developer": "javascript",
  "Frontend Developer": "javascript",
  "Backend Developer": "javascript",
  "Data Scientist": "python",
  "Product Manager": "markdown"
};

function InterviewRunner() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { activeSession } = useSelector(state => state.sessions);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState('javascript');
  const [submittedLocal, setSubmittedLocal] = useState({});

  const [drafts, setDrafts] = useState(() => {
    const saved = localStorage.getItem(`drafts_${sessionId}`);
    return saved ? JSON.parse(saved) : {};
  });

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  
  const [hasJoined, setHasJoined] = useState(false);
  const [isTerminated, setIsTerminated] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [model, setModel] = useState(null);
  const [proctorWarning, setProctorWarning] = useState("");
  const [proctorStatus, setProctorStatus] = useState("Initializing AI...");
  const [violationCount, setViolationCount] = useState(0);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);

  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const sessionTimerRef = useRef(null);
  const videoRef = useRef(null);
  const videoStreamRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const faceLossCounterRef = useRef(0);
  const ttsAudioRef = useRef(null);

  const currentQuestion = useMemo(() => activeSession?.questions?.[currentQuestionIndex] || null, [activeSession?.questions, currentQuestionIndex]);
  const isReduxSubmitted = currentQuestion?.isSubmitted === true;
  const isLocallySubmitted = submittedLocal[currentQuestionIndex] === true;
  const isQuestionLocked = isReduxSubmitted || isLocallySubmitted;

  const isWaitingForAI = useMemo(() => {
     if (!isQuestionLocked) return false;
     if (!currentQuestion?.isEvaluated) return true;
     if (activeSession?.questions?.length <= currentQuestionIndex + 1) return true;
     return false;
  }, [isQuestionLocked, currentQuestion?.isEvaluated, activeSession?.questions?.length, currentQuestionIndex]);

  // SOCKET: Real-time update listener
  useEffect(() => {
    const userJson = localStorage.getItem('user');
    if (userJson) {
       const user = JSON.parse(userJson);
       const endpoint = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace('/api', '');
       socketRef.current = io(endpoint, { query: { userId: user._id } });
       
       socketRef.current.on('sessionUpdate', (data) => {
         if (data.sessionId === sessionId) {
            dispatch(socketUpdateSession(data));
            if (data.status === 'EVALUATION_FAILED') {
                toast.error(data.message || "Evaluation failed. Please try submitting again.");
                setSubmittedLocal(p => ({ ...p, [currentQuestionIndex]: false }));
            }
         }
       });
    }
    return () => socketRef.current?.disconnect();
  }, [dispatch, sessionId]);

  // Anti-Cheat: Visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && hasJoined && !isTerminated) {
        setViolationCount(v => v + 1);
        toast.error("Integrity Warning: Focus Lost!", { position: "top-center" });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [hasJoined, isTerminated]);

  // Anti-Cheat: Clipboard, Context Menu, PrintScreen
  useEffect(() => {
    if (isTerminated) return;
    const handleCopyPaste = (e) => {
       e.preventDefault();
       toast.error("Violation: Copy/Paste is disabled during the interview.", { position: "top-center", toastId: 'copypaste' });
    };
    const handleContextMenu = (e) => {
       e.preventDefault();
       toast.error("Violation: Right-click is disabled.", { position: "top-center", toastId: 'contextmenu' });
    };
    const handleKeyUp = (e) => {
       if (e.key === 'PrintScreen' && hasJoined) {
          setViolationCount(v => v + 1);
          toast.error("Violation: Screenshots are prohibited!", { position: "top-center", toastId: 'screenshot' });
       }
    };

    document.addEventListener('copy', handleCopyPaste);
    document.addEventListener('paste', handleCopyPaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
       document.removeEventListener('copy', handleCopyPaste);
       document.removeEventListener('paste', handleCopyPaste);
       document.removeEventListener('contextmenu', handleContextMenu);
       document.removeEventListener('keyup', handleKeyUp);
    };
  }, [hasJoined, isTerminated]);

  // AI Proctor Loader
  useEffect(() => {
    const poll = setInterval(async () => {
       if (window.tf && window.cocoSsd) {
          clearInterval(poll);
          try {
             await window.tf.ready();
             const loadedModel = await window.cocoSsd.load();
             setModel(loadedModel);
             setProctorStatus("AI PROCTOR: ACTIVE");
          } catch (e) { setProctorStatus("AI PROCTOR: ERR"); }
       }
    }, 1000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => { if (sessionId) dispatch(getSessionById(sessionId)); }, [dispatch, sessionId]);
  useEffect(() => {
    if (activeSession?.jobDescription) setSelectedLanguage("javascript"); // Default to JS, or can try to parse from JD
    if (activeSession?.questions?.length > 0) setCurrentQuestionIndex(activeSession.questions.length - 1);
  }, [activeSession?.jobDescription, activeSession?.questions?.length]);
  useEffect(() => { localStorage.setItem(`drafts_${sessionId}`, JSON.stringify(drafts)); }, [drafts, sessionId]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Proctor Loop
  useEffect(() => {
    if (hasJoined && model && videoRef.current && !isTerminated) {
        detectionIntervalRef.current = setInterval(async () => {
           if (videoRef.current?.readyState === 4) {
              try {
                const predictions = await model.detect(videoRef.current);
                const personsCount = predictions.filter(p => p.class === 'person').length;
                const hasPerson = personsCount > 0;
                const hasMultiplePersons = personsCount > 1;
                const hasPhone = predictions.some(p => p.class === 'cell phone');
                
                if (hasPhone) {
                  setProctorWarning("SECURITY ALERT: Cell phone detected!");
                  setViolationCount(v => v + 1);
                  toast.error("Violation: Mobile phone use prohibited.");
                } else if (hasMultiplePersons) {
                  setProctorWarning("SECURITY ALERT: Multiple faces detected!");
                  setViolationCount(v => v + 1);
                  toast.error("Violation: Multiple people detected in frame.");
                } else if (!hasPerson) {
                   faceLossCounterRef.current += 1;
                   if (faceLossCounterRef.current >= 2) { 
                      setProctorWarning("WARNING: Face not detected!");
                      setViolationCount(v => v + 1);
                      toast.error("Violation: Candidate left frame.");
                   }
                } else {
                   faceLossCounterRef.current = 0;
                   setProctorWarning("");
                }
              } catch (e) {}
           }
        }, 4000);
    }
    return () => clearInterval(detectionIntervalRef.current);
  }, [hasJoined, model, isTerminated]);

  // --- SMART SERVER-SYNCED TIMER ---
  useEffect(() => {
    if (isTerminated) return;

    if (hasJoined && activeSession?.startTime) {
       const durationSec = (activeSession.duration || 10) * 60;
       const startTimeMs = new Date(activeSession.startTime).getTime();
       const pauseOffsetMS = activeSession.pauseTimeMS || 0;

       if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
       sessionTimerRef.current = setInterval(() => {
          // --- PERSISTENT PAUSE LOGIC ---
          // Use the exact pause-start timestamp if the server says it's paused.
          // Otherwise use the current time.
          const effectiveNow = activeSession.isPaused && activeSession.lastPauseStart 
             ? new Date(activeSession.lastPauseStart).getTime() 
             : Date.now();

          const totalElapsedSec = Math.max(0, (effectiveNow - startTimeMs - pauseOffsetMS) / 1000);
          const remainingSec = Math.max(0, durationSec - totalElapsedSec);
          
          if (remainingSec <= 0 && durationSec > 0) {
             setTimeLeft(0);
             clearInterval(sessionTimerRef.current);
             terminateInterview(); 
          } else {
             setTimeLeft(remainingSec);
          }
       }, 1000);
    }
    return () => clearInterval(sessionTimerRef.current);
  }, [isWaitingForAI, hasJoined, activeSession?.startTime, activeSession?.duration, activeSession?.pauseTimeMS, activeSession?.isPaused, activeSession?.lastPauseStart, isTerminated]);

  // TTS
  useEffect(() => {
    if (hasJoined && currentQuestion?.questionText && !isQuestionLocked && !isTerminated) {
       if (ttsAudioRef.current) {
           ttsAudioRef.current.pause();
           ttsAudioRef.current = null;
       }
       setIsSpeaking(true);
       const fetchTTS = async () => {
           try {
               const AI_SERVICE_URL = import.meta.env.VITE_AI_SERVICE_URL || 'https://ai-interviewer-nx1f.onrender.com';
               // Strip trailing slash if present to avoid //tts
               const baseUrl = AI_SERVICE_URL.endsWith('/') ? AI_SERVICE_URL.slice(0, -1) : AI_SERVICE_URL;
               const res = await fetch(`${baseUrl}/tts`, {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ text: currentQuestion.questionText })
               });
               if (!res.ok) throw new Error("TTS failed");
               const blob = await res.blob();
               const url = URL.createObjectURL(blob);
               const audio = new Audio(url);
               ttsAudioRef.current = audio;
               audio.onended = () => setIsSpeaking(false);
               audio.play();
           } catch (e) {
               console.error("TTS error:", e);
               setIsSpeaking(false);
           }
       };
       fetchTTS();
    }
    return () => {
        if (ttsAudioRef.current) {
            ttsAudioRef.current.pause();
            ttsAudioRef.current = null;
        }
        setIsSpeaking(false);
    };
  }, [currentQuestionIndex, currentQuestion?.questionText, hasJoined, isQuestionLocked, isTerminated]);

    const handleJoin = async () => {
      const elem = document.documentElement;
      if (elem.requestFullscreen) elem.requestFullscreen().catch(()=>{});
      try {
         const stream = await navigator.mediaDevices.getUserMedia({ video: true });
         videoStreamRef.current = stream;
      } catch (err) { toast.error("Camera required."); return; }
      
      // Call StartSession to officially kick off the timer
      try {
         await dispatch(startSession(sessionId)).unwrap();
         setHasJoined(true);
      } catch (e) {
         toast.error("Failed to start session timer.");
      }
  };

  const startRecording = async () => {
    if (isQuestionLocked) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setDrafts(p => ({ ...p, [currentQuestionIndex]: { ...p[currentQuestionIndex], audioBlob: blob } }));
      };
      mediaRecorderRef.current.start(); 
      setIsRecording(true);
      setRecordingTime(0);
      timerIntervalRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
    } catch (err) { toast.error("Mic error."); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
      clearInterval(timerIntervalRef.current);
      setIsRecording(false);
    }
  };

  const handleSubmit = async () => {
    if (isQuestionLocked) return;
    if (isRecording) stopRecording();
    const draft = drafts[currentQuestionIndex];
    if (!draft?.code && !draft?.audioBlob) { toast.warning("Submit answer."); return; }
    
    setSubmittedLocal(p => ({ ...p, [currentQuestionIndex]: true }));
    if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
    }
    
    const formData = new FormData();
    formData.append('questionIndex', currentQuestionIndex);
    formData.append('violations', violationCount);
    if (draft.code) formData.append('code', draft.code);
    if (draft.audioBlob) formData.append('audioFile', draft.audioBlob, 'answer.webm');
    
    dispatch(submitAnswer({ sessionId, formData })).unwrap().catch(() => {
        setSubmittedLocal(p => ({ ...p, [currentQuestionIndex]: false }));
        toast.error("Retry submission.");
    });
  };

  const terminateInterview = () => {
    setIsTerminated(true);
    if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
    }
    if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
    
    // STOP CAMERA TRACKS IMMEDIATELY
    if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(track => track.stop());
        videoStreamRef.current = null;
    }

    dispatch(endSession({ sessionId, violations: violationCount })).unwrap().then(() => {
        localStorage.removeItem(`drafts_${sessionId}`);
    });
  };

  const currentDraft = drafts[currentQuestionIndex] || {};

  if (!activeSession) return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-teal-400 font-bold">RECONSTRUCTING DATA...</div>;

  // --- THANK YOU / CONCLUSION SCREEN ---
  if (isTerminated) {
     return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center animate-in fade-in zoom-in duration-700">
           <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl border border-slate-100 max-w-2xl w-full">
              <div className="w-20 h-20 bg-teal-500/10 text-teal-600 rounded-3xl flex items-center justify-center text-4xl mb-8 mx-auto">🎉</div>
              <h1 className="text-4xl font-black text-slate-900 mb-4 uppercase tracking-tighter">Interview Complete!</h1>
              <p className="text-slate-500 mb-10 font-medium leading-relaxed">
                 Thank you for your time and effort. We have logged your performance, integrity metrics, and AI technical evaluations. 
                 A comprehensive report is now ready for your review.
              </p>
              <button onClick={() => navigate(`/review/${sessionId}`)} className="w-full py-5 bg-teal-600 text-white font-black text-xl rounded-3xl hover:bg-teal-500 transition-all shadow-xl shadow-teal-500/20 active:scale-95 uppercase tracking-widest">
                 View Global Analysis
              </button>
           </div>
           <p className="mt-10 text-[10px] font-black text-slate-300 uppercase tracking-widest">Assessment System v2.0 • Secured by AI Proctor</p>
        </div>
     );
  }

  // Waiting Room
  if (!hasJoined) {
     return (
       <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 text-white p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
          <div className="z-10 flex flex-col items-center text-center max-w-lg mx-auto">
             <div className="w-20 h-20 bg-teal-500/20 text-teal-400 rounded-full flex items-center justify-center text-4xl mb-6 shadow-[0_0_50px_rgba(20,184,166,0.3)] border border-teal-500/30">
                 🔒
             </div>
             <h1 className="text-3xl sm:text-5xl font-black mb-4 uppercase tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Secure Waiting Room</h1>
             <p className="text-slate-400 mb-12 text-sm sm:text-base font-medium leading-relaxed">
                 The timer will only start ticking once you join. All AI processing time is excluded from your total duration.
             </p>
             {!(activeSession?.questions?.length > 0) ? (
                <div className="flex flex-col items-center gap-4 bg-slate-900/50 p-6 rounded-3xl border border-white/5 backdrop-blur-sm">
                    <div className="w-10 h-10 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs font-black uppercase text-teal-400 tracking-widest">Loading Adaptive Content...</p>
                </div>
             ) : (
                <button onClick={handleJoin} className="w-full sm:w-auto px-12 py-5 bg-teal-600 text-white font-black text-lg sm:text-xl rounded-2xl hover:bg-teal-500 transition-all shadow-[0_0_30px_rgba(20,184,166,0.4)] active:scale-95 uppercase tracking-widest border border-teal-400/50">
                    Enter Interview
                </button>
             )}
          </div>
       </div>
     );
  }

  return (
    <div className="flex-1 bg-slate-50 flex flex-col font-sans select-none">
      {/* HEADER SECTION - FIXED FOR MOBILE */}
      <div className="bg-slate-900 text-white px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-between items-center sm:items-center gap-4 z-20 sticky top-0 shadow-xl border-b border-white/5">
        
        <div className="flex items-center justify-between w-full sm:w-auto gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 bg-white/5 flex shrink-0 items-center justify-center rounded-xl border border-white/10 ${isSpeaking ? 'ring-2 ring-teal-500' : ''}`}>
                <span className="text-xl sm:text-2xl">🤖</span>
            </div>
            <div>
                <h1 className="text-base sm:text-xl font-bold tracking-tight text-white leading-tight line-clamp-1">{activeSession.roundType === 'tech-1' ? 'Tech Round 1' : activeSession.roundType === 'tech-2' ? 'Tech Round 2' : 'HR Round'}</h1>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
                <span className={`text-[8px] sm:text-[9px] font-black uppercase px-2 py-0.5 rounded ${proctorStatus.includes('ACTIVE') ? 'bg-emerald-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>{proctorStatus}</span>
                {isWaitingForAI && <span className="text-[8px] sm:text-[9px] font-black uppercase bg-amber-500 text-slate-900 px-2 py-0.5 rounded animate-pulse">PAUSED</span>}
                {violationCount > 0 && <span className="text-[8px] sm:text-[9px] font-black uppercase bg-rose-600 text-white px-2 py-0.5 rounded">Security Logged</span>}
                </div>
            </div>
            </div>
            
            {/* Quick exit on mobile moves here to prevent overlap with timer */}
            <div className="sm:hidden shrink-0">
                 <button onClick={() => setIsExitModalOpen(true)} className="text-[9px] font-black bg-rose-600/20 text-rose-500 border border-rose-600/50 hover:bg-rose-600 hover:text-white px-2 py-2 rounded-lg tracking-widest shrink-0">EXIT</button>
            </div>
        </div>

        <div className="flex items-center justify-between w-full sm:w-auto sm:gap-6 bg-slate-800/50 sm:bg-transparent p-2 sm:p-0 rounded-xl sm:rounded-none border sm:border-none border-white/10">
           <div className={`flex flex-col items-center sm:items-end w-full sm:w-auto sm:pr-4 sm:border-r border-white/10`}>
              <span className="text-[9px] sm:text-[10px] font-black uppercase text-slate-400 tracking-widest">Time Remaining</span>
              <span className={`font-mono text-xl sm:text-2xl font-black tabular-nums transition-colors ${timeLeft < 120 ? 'text-rose-500' : 'text-white'}`}>
                 {formatTime(timeLeft)}
              </span>
           </div>
           <div className="hidden sm:block">
               <button onClick={() => setIsExitModalOpen(true)} className="text-[10px] font-black bg-rose-600/20 text-rose-500 border border-rose-600/50 hover:bg-rose-600 hover:text-white px-3 py-2 rounded-lg tracking-widest whitespace-nowrap">QUICK EXIT</button>
           </div>
        </div>
      </div>

      <Modal 
         isOpen={isExitModalOpen}
         onClose={() => setIsExitModalOpen(false)}
         onConfirm={terminateInterview}
         title="End Interview?"
         message="Are you sure you want to exit? Your answers submitted so far will be saved and evaluated, but you cannot return to this session."
         confirmText="End & Analyze"
         type="info"
      />

      <div className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6 sm:gap-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
           
           <div className="lg:col-span-4 flex flex-col gap-4 sm:gap-6">
              <div className="bg-black rounded-3xl sm:rounded-[2.5rem] overflow-hidden shadow-2xl relative border-2 sm:border-4 border-white aspect-video bg-slate-950">
                 <video ref={(v) => { if(v){ videoRef.current = v; if(videoStreamRef.current && !v.srcObject) v.srcObject = videoStreamRef.current; } }} autoPlay muted playsInline className="w-full h-full object-cover -scale-x-100" />
                 {proctorWarning && <div className="absolute inset-x-0 bottom-0 bg-rose-600 font-bold p-2 sm:p-3 text-center text-white text-[10px] sm:text-[11px] uppercase z-10 animate-pulse">{proctorWarning}</div>}
              </div>

              <div className="bg-white p-5 sm:p-6 md:p-8 rounded-3xl sm:rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col min-h-[200px] sm:min-h-[250px] relative overflow-hidden">
                 <div className="absolute -right-10 -top-10 w-32 h-32 bg-teal-500/5 rounded-full blur-[40px]"></div>
                 <span className="text-[9px] sm:text-[10px] font-black text-teal-600 uppercase tracking-[0.2em] mb-4 border-l-2 border-teal-500 pl-3">Live Question</span>
                 <div className="flex-1 z-10 prose prose-sm sm:prose-base prose-slate max-w-none prose-headings:font-bold prose-headings:text-slate-800 prose-p:leading-relaxed prose-a:text-teal-600 overflow-y-auto pr-2">
                     <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                            em: ({node, ...props}) => <em className="italic text-teal-600 font-medium" {...props} />,
                            strong: ({node, ...props}) => <strong className="font-black text-slate-900" {...props} />,
                            code({node, inline, className, children, ...props}) {
                                const match = /language-(\w+)/.exec(className || '')
                                return !inline && match ? (
                                <SyntaxHighlighter
                                    style={vscDarkPlus}
                                    language={match[1]}
                                    PreTag="div"
                                    className="rounded-xl !my-3 !bg-slate-900 border border-slate-800 text-xs sm:text-sm"
                                    {...props}
                                >
                                    {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                                ) : (
                                <code className="bg-slate-100 text-teal-700 px-1.5 py-0.5 rounded-md text-[13px] font-mono border border-slate-200" {...props}>
                                    {children}
                                </code>
                                )
                            },
                        }}
                     >
                         {currentQuestion?.questionText}
                     </ReactMarkdown>
                 </div>
              </div>
           </div>

           <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-6">
              <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2rem] border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                 <div className="flex items-center gap-3 sm:gap-4 font-black text-slate-400 uppercase tracking-widest text-[9px] sm:text-[10px] self-start sm:self-auto">🎙️ Verbal Response</div>
                 <div className="flex items-center w-full sm:w-auto justify-end">
                     {!isRecording && !currentDraft.audioBlob ? (
                        <button onClick={startRecording} disabled={isQuestionLocked} className="w-full sm:w-auto px-6 sm:px-8 py-3 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-30">Record Answer</button>
                     ) : isRecording ? (
                        <div className="flex items-center justify-between w-full sm:w-auto sm:justify-end gap-4"><span className="font-mono text-lg sm:text-xl font-bold tabular-nums">00:{recordingTime.toString().padStart(2, '0')}</span><button onClick={stopRecording} className="px-6 sm:px-8 py-3 bg-rose-600 text-white rounded-full text-[10px] font-black uppercase animate-pulse shrink-0">Stop Recording</button></div>
                     ) : (
                        <div className="flex items-center justify-between w-full sm:w-auto gap-3 px-4 sm:px-6 py-2.5 sm:py-3 bg-emerald-50 rounded-full border border-emerald-100"><span className="text-[9px] sm:text-[10px] font-black text-emerald-800 uppercase tracking-widest">Audio Ready</span>{!isQuestionLocked && <button onClick={()=>setDrafts(p=>({...p, [currentQuestionIndex]:{...p[currentQuestionIndex], audioBlob:null}}))} className="text-rose-500 text-[9px] font-black uppercase hover:underline ml-2">Delete</button>}</div>
                     )}
                 </div>
              </div>

              <div className="bg-[#1e1e1e] rounded-3xl sm:rounded-[2.5rem] shadow-2xl flex flex-col border border-black overflow-hidden h-[300px] sm:h-[380px]">
                 <div className="flex justify-between items-center px-4 sm:px-8 py-2 sm:py-3 bg-[#181818] border-b border-black">
                    <span className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">Sandbox</span>
                    <select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)} disabled={isQuestionLocked} className="text-[10px] bg-[#2d2d2d] text-slate-300 border-none rounded-lg px-3 sm:px-4 py-1.5 font-bold outline-none cursor-pointer">
                       {SUPPORTED_LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                 </div>
                 <div className="flex-1 relative"><MonacoEditor language={selectedLanguage} theme="vs-dark" value={currentDraft.code || ''} onChange={(c)=>{ if(!isQuestionLocked) setDrafts(p=>({...p,[currentQuestionIndex]:{...p[currentQuestionIndex],code:c}})); }} options={{ minimap:{enabled:false}, fontSize:13, padding:{top:20, bottom:20}, readOnly:isQuestionLocked, scrollBeyondLastLine:false, smoothScrolling:true, lineNumbersMinChars: 3 }} /></div>
              </div>

              <div className="flex justify-center">
                 <button 
                  onClick={handleSubmit} 
                  disabled={isQuestionLocked || isWaitingForAI} 
                  className={`w-full py-5 rounded-[2rem] font-black tracking-widest uppercase text-xs shadow-2xl transition-all ${isWaitingForAI ? 'bg-amber-100 text-amber-600 cursor-not-allowed' : isQuestionLocked ? 'bg-emerald-50 text-emerald-600' : 'bg-teal-600 hover:bg-teal-500 text-white active:scale-95'}`}
                 >
                    {isWaitingForAI ? "PROCESSING RESPONSE..." : isQuestionLocked ? "LOCKED • PREPARING NEXT" : "SUBMIT & PROCEED"}
                 </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

export default InterviewRunner;