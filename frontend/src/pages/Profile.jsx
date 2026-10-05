import { useState, useEffect, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { toast } from 'react-toastify'
import { updateProfile, reset } from '../features/auth/authSlice'
import { getSessions } from '../features/sessions/sessionSlice'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  RadialLinearScale,
  Filler,
} from 'chart.js';
import { Line, Radar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Filler,
  Title,
  Tooltip,
  Legend
);

const ROLES = [
  "MERN Stack Developer",
  "MEAN Stack Developer",
  "Full Stack Python",
  "Full Stack Java",
  "Frontend Developer",
  "Backend Developer",
  "Data Scientist",
  "Data Analyst",
  "Machine Learning Engineer",
  "DevOps Engineer",
  "Cloud Engineer (AWS/Azure/GCP)",
  "Cybersecurity Engineer",
  "Blockchain Developer",
  "Mobile Developer (iOS/Android)",
  "Game Developer",
  "UI/UX Designer",
  "QA Automation Engineer",
  "Product Manager"
];

const inputBase = 'w-full bg-slate-50 border-2 border-transparent rounded-xl sm:rounded-2xl p-3.5 sm-4 font-semibold text-slate-700 text-base transition-all focus:bg-white focus:border-teal-500 outline-none';

const Profile = () => {
  const dispatch = useDispatch();
  const { user, isSuccess, isError, message, isProfileLoading } = useSelector((state) => state.auth);
  const { sessions, isLoading: sessionsLoading } = useSelector((state) => state.sessions);

  const [activeTab, setActiveTab] = useState('analytics'); // 'analytics' or 'settings'
  
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    preferredRole: user?.preferredRole || '',
  });

  useEffect(() => {
    if (isSuccess && activeTab === 'settings') {
      toast.success('Profile updated!')
    }
  }, [user, isError, message, isSuccess, dispatch, activeTab])

  useEffect(() => {
    dispatch(getSessions());
  }, [dispatch]);

  const completedSessions = useMemo(() => {
      if (!sessions) return [];
      return [...sessions].filter(s => s.status === 'completed' && s.overallScore >= 0).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [sessions]);

  useEffect(() => {
    if (completedSessions.length > 0 && !aiAnalysis && !isAnalyzing) {
      const cacheKey = `ai_analysis_${user?._id}`;
      const cachedData = localStorage.getItem(cacheKey);
      
      if (cachedData) {
          try {
              const parsedCache = JSON.parse(cachedData);
              // Only use cache if the user hasn't completed new interviews
              if (parsedCache.sessionCount === completedSessions.length) {
                  setAiAnalysis(parsedCache.data);
                  return;
              }
          } catch (e) {
              console.error("Failed to parse cache", e);
          }
      }

      const fetchAnalysis = async () => {
        setIsAnalyzing(true);
        try {
            const history = completedSessions.slice(0, 5).map(s => {
                const aggregatedFeedback = (s.questions || [])
                    .map(q => q.aiFeedback)
                    .filter(fb => fb && fb !== "Not yet submitted or evaluated")
                    .join(" | ");

                return {
                    role: s.roundType === 'tech-1' ? 'Tech Round 1' : s.roundType === 'tech-2' ? 'Tech Round 2' : 'HR Round',
                    technicalScore: s.metrics?.avgTechnical || 0,
                    confidenceScore: s.metrics?.avgConfidence || 0,
                    aiFeedback: aggregatedFeedback
                };
            });
            const res = await fetch(`${import.meta.env.VITE_API_URL}/sessions/analyze-profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${user.token}`
                },
                body: JSON.stringify({ history })
            });
            const data = await res.json();
            setAiAnalysis(data);
            
            // Save to cache
            localStorage.setItem(cacheKey, JSON.stringify({
                sessionCount: completedSessions.length,
                data: data
            }));
        } catch (error) {
            console.error(error);
        } finally {
            setIsAnalyzing(false);
        }
      };
      fetchAnalysis();
    }
  }, [completedSessions, aiAnalysis, isAnalyzing, user?._id, user?.token]);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user?.name || '',
        email: user?.email || '',
        preferredRole: user?.preferredRole || '',
      });
    }
  }, [user])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (formData.name === user.name && formData.preferredRole === user.preferredRole) {
      toast.info('No changes to save.')
      return
    }
    dispatch(updateProfile(formData))
  }

  // Analytics Computation
  const totalInterviews = completedSessions.length;
  
  const avgScore = completedSessions.length 
    ? Math.round(completedSessions.reduce((acc, s) => acc + (s.overallScore || 0), 0) / completedSessions.length)
    : 0;
    
  const bestScore = completedSessions.length 
    ? Math.max(...completedSessions.map(s => s.overallScore || 0))
    : 0;

  const avgTechnical = completedSessions.length
    ? Math.round(completedSessions.reduce((acc, s) => acc + (s.metrics?.avgTechnical || 0), 0) / completedSessions.length)
    : 0;
    
  const avgConfidence = completedSessions.length
    ? Math.round(completedSessions.reduce((acc, s) => acc + (s.metrics?.avgConfidence || 0), 0) / completedSessions.length)
    : 0;

  // Chart Data
  const lineData = {
    labels: completedSessions.map((_, i) => `Int ${i + 1}`),
    datasets: [
      {
        label: 'Overall Score',
        data: completedSessions.map(s => s.overallScore || 0),
        borderColor: '#14b8a6', // teal-500
        backgroundColor: 'rgba(20, 184, 166, 0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#0f766e',
      }
    ]
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: { min: 0, max: 100 }
    }
  };

  const radarData = {
    labels: ['Technical', 'Delivery', 'Code Quality', 'Communication', 'Problem Solving'],
    datasets: [
      {
        label: 'Average Skill Profile',
        data: [
            avgTechnical, 
            avgConfidence, 
            Math.max(0, avgTechnical - 5), // Simulated code quality
            Math.min(100, avgConfidence + 5), // Simulated communication
            avgTechnical // Simulated problem solving
        ],
        backgroundColor: 'rgba(20, 184, 166, 0.2)',
        borderColor: '#14b8a6',
        pointBackgroundColor: '#14b8a6',
        pointBorderColor: '#fff',
      }
    ]
  };

  const radarOptions = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
          r: {
              min: 0,
              max: 100,
              ticks: { display: false }
          }
      },
      plugins: {
          legend: { display: false }
      }
  };


  return (
    <div className='max-w-6xl mx-auto px-4 py-6 sm:py-12 pb-24'>
      <div className='bg-white rounded-3xl shadow-xl p-6 sm:p-10 border border-slate-100'>
        
        {/* Header & Tabs */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 border-b border-slate-200 pb-4">
            <div>
                <h1 className='text-3xl font-black text-slate-900'>User Profile</h1>
                <p className='text-sm text-slate-500 mt-1'>
                    Track your progress and update your account.
                </p>
            </div>
            
            <div className="flex space-x-2 mt-6 sm:mt-0 bg-slate-100 p-1 rounded-xl">
                <button 
                    onClick={() => setActiveTab('analytics')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${activeTab === 'analytics' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Dashboard
                </button>
                <button 
                    onClick={() => setActiveTab('settings')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${activeTab === 'settings' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Settings
                </button>
            </div>
        </div>

        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (
            <div className="space-y-8 animate-in fade-in duration-300">
                {sessionsLoading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader />
                    </div>
                ) : completedSessions.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 rounded-3xl border border-slate-200 border-dashed">
                        <div className="text-4xl mb-4">📊</div>
                        <h3 className="text-xl font-bold text-slate-700">No Interview Data Yet</h3>
                        <p className="text-slate-500 mt-2">Complete your first AI interview to unlock your analytics dashboard.</p>
                    </div>
                ) : (
                    <>
                        {/* Key Metrics */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                            <div className="bg-teal-50 border border-teal-100 rounded-2xl p-6 relative overflow-hidden">
                                <div className="text-teal-600/10 absolute -right-4 -bottom-4 text-8xl font-black">📈</div>
                                <h3 className="text-xs font-black uppercase tracking-widest text-teal-600 mb-1">Interviews</h3>
                                <div className="text-4xl font-black text-teal-900">{totalInterviews}</div>
                            </div>
                            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 relative overflow-hidden">
                                <div className="text-indigo-600/10 absolute -right-4 -bottom-4 text-8xl font-black">⭐</div>
                                <h3 className="text-xs font-black uppercase tracking-widest text-indigo-600 mb-1">Avg Score</h3>
                                <div className="text-4xl font-black text-indigo-900">{avgScore}<span className="text-lg text-indigo-400">/100</span></div>
                            </div>
                            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 relative overflow-hidden">
                                <div className="text-amber-600/10 absolute -right-4 -bottom-4 text-8xl font-black">🏆</div>
                                <h3 className="text-xs font-black uppercase tracking-widest text-amber-600 mb-1">Best Score</h3>
                                <div className="text-4xl font-black text-amber-900">{bestScore}<span className="text-lg text-amber-400">/100</span></div>
                            </div>
                        </div>

                        {/* Charts */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-6">Progress Over Time</h3>
                                <div className="h-64 w-full">
                                    <Line data={lineData} options={lineOptions} />
                                </div>
                            </div>

                            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center">
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-2 w-full text-left">Skill Profile</h3>
                                <div className="h-56 w-full flex-1">
                                    <Radar data={radarData} options={radarOptions} />
                                </div>
                            </div>
                        </div>

                        {/* Weakness Analysis */}
                        <div className="bg-slate-900 rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden mt-6">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/20 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2"></div>
                            <h3 className="text-sm font-black uppercase tracking-widest text-teal-400 mb-4 flex items-center space-x-2">
                                <span>AI Performance Analysis</span>
                                {isAnalyzing && <span className="flex space-x-1"><span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce"></span><span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span><span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></span></span>}
                            </h3>
                            
                            <div className="space-y-4 relative z-10">
                                {isAnalyzing ? (
                                    <p className="text-slate-400 italic">Synthesizing your historical data...</p>
                                ) : aiAnalysis ? (
                                    <>
                                        <p className="text-slate-300 leading-relaxed">
                                            {aiAnalysis.summary}
                                        </p>
                                        <div className="flex items-start space-x-3 bg-white/10 p-4 rounded-xl border border-white/10">
                                            <div className="text-amber-400">💡</div>
                                            <p className="text-sm text-slate-200">
                                                <strong>Recommendation:</strong> {aiAnalysis.recommendation}
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-slate-400 italic">Complete more interviews to generate a real AI performance analysis.</p>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
            <div className="max-w-2xl animate-in fade-in duration-300">
                <form onSubmit={handleSubmit} className='space-y-6' >
                    <FormField label="Full Name">
                        <input
                        type="text"
                        className={inputBase}
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder='Enter your name'
                        />
                    </FormField>

                    <FormField label="Email Address (Fixed)" muted>
                        <input
                        type="email"
                        className='w-full bg-slate-100 rounded-xl sm:rounded-2xl p-3.5 sm-4 font-semibold text-slate-500 text-base cursor-not-allowed'
                        disabled
                        value={formData.email}
                        onChange={handleChange}
                        />
                    </FormField>

                    <FormField label="Target Role">
                        <div className='relative'>
                        <select name="preferredRole" value={formData.preferredRole} onChange={handleChange} className={`${inputBase} appearance-none`}>
                            {
                            ROLES.map((role) => (
                                <option key={role} value={role}>{role}</option>
                            ))
                            }
                        </select>
                        <SelectArrow />
                        </div>
                    </FormField>

                    <div className='pt-4'>
                        <button
                        type='submit'
                        disabled={isProfileLoading}
                        className={`w-full flex items-center justify-center gap-2 py-4 font-bold rounded-xl sm:rounded-2xl transition-all active:scale-[0.98] ${isProfileLoading ? 'bg-slate-200 text-slate-400 cursor-wait' : 'bg-teal-600 text-white hover:bg-teal-700 shadow-lg shadow-teal-100'}`}>
                        {
                            isProfileLoading ? <Loader /> : 'Save Changes'
                        }
                        </button>
                    </div>
                </form>
            </div>
        )}

      </div>
    </div>
  )
}

export default Profile

function FormField({ label, children, muted }) {
  return (
    <div className={`space-y-1.5 ${muted ? 'opacity-60' : ''}`}>
      <label className='ml-1 text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest'>{label}</label>
      {children}
    </div>
  )
}

function SelectArrow() {
  return (
    <div className='absolute right-4 top-1/2  -translate-y-1/2 pointer-events-none text-slate-400'>
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </div>
  )
}

function Loader() {
  return (
    <>
      <span className='w-5 h-5 border-2 border-slate-400 border-t-transparent animate-spin rounded-full' />
      <span>Loading...</span>
    </>
  )
}
