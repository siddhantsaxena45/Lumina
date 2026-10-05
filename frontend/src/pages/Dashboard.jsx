import { useState, useEffect } from "react"
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { createSession, getSessions, reset, deleteSession } from '../features/sessions/sessionSlice'
import { toast } from 'react-toastify'
import SessionCard from "../components/SessionCard"
import Modal from "../components/Modal"
import * as pdfjsLib from 'pdfjs-dist';

// Need to set workerSrc for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const ROUND_TYPES = [
  { id: 'tech-1', label: 'Tech Round 1', desc: 'Coding, DSA, or Full Stack based on JD', icon: '💻' },
  { id: 'tech-2', label: 'Tech Round 2', desc: 'BTech concepts, OOPs, DBMS, Resume deep dive, Puzzles', icon: '🧠' },
  { id: 'hr', label: 'HR Round', desc: 'Behavioral & Fit Round (STAR method)', icon: '🤝' }
];

const DURATIONS = [10, 15, 30, 45, 60];

const Dashboard = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { sessions, isLoading, isGenerating, isError, message } = useSelector((state) => state.sessions);
  const isProcessing = isGenerating;

  const [formData, setFormData] = useState({
    jobDescription: "",
    resumeText: "",
    roundType: ROUND_TYPES[0].id,
    duration: DURATIONS[1],
  });

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);

  useEffect(() => {
    dispatch(getSessions());
  }, [dispatch]);

  useEffect(() => {
    if (isError && message) {
      toast.error(message);
      dispatch(reset());
    }
  }, [isError, message, dispatch]);

  const onChange = (e) => {
    setFormData((prevState) => ({ ...prevState, [e.target.name]: e.target.value }));
  }

  const handleFileUpload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a valid PDF file.');
      return;
    }

    try {
      toast.info(`Parsing ${file.name}...`);
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }

      setFormData(prev => ({ ...prev, [field]: fullText.trim() }));
      toast.success(`Successfully parsed ${file.name}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to parse PDF.');
    }
  };

  const handleRoundSelect = (id) => {
    setFormData(prev => ({ ...prev, roundType: id }));
  }

  const onSubmit = (e) => {
    e.preventDefault();
    if (!formData.jobDescription.trim() || !formData.resumeText.trim()) {
      toast.error("Please provide both Job Description and Resume.");
      return;
    }
    dispatch(createSession(formData));
  }

  const viewSession = (session) => {
    if (session.status === 'completed') {
      navigate(`/review/${session._id}`);
    } else if (session.status === 'in-progress') {
      navigate(`/interview/${session._id}`);
    } else {
      toast.info('Session not ready yet')
    }
  }

  const handleDelete = (e, sessionId) => {
    e.stopPropagation();
    setSessionToDelete(sessionId);
    setIsDeleteModalOpen(true);
  }

  const confirmDelete = () => {
    if (sessionToDelete) {
      dispatch(deleteSession(sessionToDelete));
      toast.success('Session Deleted');
      setSessionToDelete(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8 font-sans animate-in fade-in duration-700">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-slate-200">
          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
              Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-emerald-600">{user?.name?.split(' ')[0] || 'Guest'}</span>
            </h1>
            <p className="text-slate-500 mt-2 text-lg font-medium">Configure your next AI-driven technical interview.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="bg-teal-100 p-2 rounded-xl text-teal-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Sessions</p>
                <p className="text-2xl font-black text-slate-800 leading-none">{sessions.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Form Section */}
          <div className="lg:col-span-7 space-y-8">
            <form onSubmit={onSubmit} className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 p-8 sm:p-10 relative overflow-hidden group">
              {/* Decorative Gradient Background */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-400/10 to-emerald-500/10 rounded-full blur-3xl -z-10 group-hover:scale-110 transition-transform duration-700"></div>

              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center text-sm font-bold">1</span>
                    Context
                  </h2>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-bold text-slate-700 flex flex-col sm:flex-row sm:items-center sm:gap-2">
                          Job Description
                          <span className="text-xs text-slate-400 font-normal">Paste or upload JD</span>
                        </label>
                        <div className="relative overflow-hidden inline-block bg-teal-50 hover:bg-teal-100 text-teal-600 border border-teal-200 rounded-lg px-3 py-1 text-xs font-bold transition-colors cursor-pointer">
                          <span>Upload PDF</span>
                          <input type="file" accept="application/pdf" className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleFileUpload(e, 'jobDescription')} />
                        </div>
                      </div>
                      <textarea 
                        name="jobDescription"
                        value={formData.jobDescription}
                        onChange={onChange}
                        placeholder="e.g. We are looking for a Senior Frontend Engineer with 5+ years of React..."
                        className="w-full h-32 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-700 focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all resize-none shadow-inner"
                        required
                      ></textarea>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-bold text-slate-700 flex flex-col sm:flex-row sm:items-center sm:gap-2">
                          Resume Text
                          <span className="text-xs text-slate-400 font-normal">Paste or upload Resume</span>
                        </label>
                        <div className="relative overflow-hidden inline-block bg-teal-50 hover:bg-teal-100 text-teal-600 border border-teal-200 rounded-lg px-3 py-1 text-xs font-bold transition-colors cursor-pointer">
                          <span>Upload PDF</span>
                          <input type="file" accept="application/pdf" className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleFileUpload(e, 'resumeText')} />
                        </div>
                      </div>
                      <textarea 
                        name="resumeText"
                        value={formData.resumeText}
                        onChange={onChange}
                        placeholder="e.g. Software Engineer with experience in MERN stack. Developed multiple full-stack applications..."
                        className="w-full h-32 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-700 focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all resize-none shadow-inner"
                        required
                      ></textarea>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center text-sm font-bold">2</span>
                    Select Round & Duration
                  </h2>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    {ROUND_TYPES.map(round => (
                      <div 
                        key={round.id}
                        onClick={() => handleRoundSelect(round.id)}
                        className={`cursor-pointer rounded-2xl p-4 border-2 transition-all duration-300 ${formData.roundType === round.id ? 'border-teal-500 bg-teal-50/50 shadow-md transform -translate-y-1' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'}`}
                      >
                        <div className="text-3xl mb-2">{round.icon}</div>
                        <h3 className={`font-bold text-sm ${formData.roundType === round.id ? 'text-teal-700' : 'text-slate-700'}`}>{round.label}</h3>
                        <p className="text-[10px] text-slate-500 mt-1 leading-tight">{round.desc}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 max-w-xs">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Duration</label>
                    <div className="relative">
                      <select name="duration" value={formData.duration} onChange={onChange} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl p-3.5 pr-10 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all shadow-inner">
                        {DURATIONS.map((dur) => <option key={dur} value={dur}>{dur} Minutes</option>)}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button type="submit" disabled={isProcessing} className={`w-full h-14 rounded-2xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-3 text-lg ${isProcessing ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 hover:shadow-teal-500/25 hover:-translate-y-0.5'}`}>
                    {isProcessing ? (
                      <>
                        <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span> 
                        Configuring AI Interview...
                      </>
                    ) : (
                      <>
                        Start Interview Session
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* History Section */}
          <div className="lg:col-span-5 flex flex-col h-[800px]">
            <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col h-full overflow-hidden">
              <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-200 flex items-center justify-center text-xl">📜</div>
                  Session History
                </h2>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-4 custom-scrollbar">
                {isLoading && sessions.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin h-10 w-10 border-t-4 border-b-4 border-teal-500 rounded-full"></div>
                  </div>
                ) : (
                  sessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                      <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-4xl shadow-inner mb-2">🛸</div>
                      <p className="text-slate-800 font-bold text-lg">No sessions yet</p>
                      <p className="text-slate-500 text-sm max-w-xs">Your past interview scores, feedback, and transcripts will appear here.</p>
                    </div>
                  ) : (
                    sessions.map((session) => (
                      <SessionCard key={session._id} session={session} onClick={viewSession} onDelete={handleDelete}/>
                    ))
                  )
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      <Modal 
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Session?"
        message="This will permanently remove your technical assessment and all AI feedback. This action is irreversible."
        confirmText="Delete Now"
        type="danger"
      />
    </div>
  )
}
export default Dashboard
