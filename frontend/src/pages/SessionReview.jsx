// frontend/src/pages/SessionReview.jsx
import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useParams, Link } from 'react-router-dom';
import { getSessionById } from '../features/sessions/sessionSlice';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const formatDuration = (start, end, pauseTimeMS = 0) => {
    if (!start || !end) return 'N/A';
    let diff = new Date(end) - new Date(start);
    diff = Math.max(0, diff - pauseTimeMS);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
};

const getSelectionOdds = (score) => {
    if (score >= 90) return { label: "High (Candidate of Choice)", color: "text-emerald-600", desc: "Your performance is exceptional. You are in the top 5% of candidates for this role." };
    if (score >= 75) return { label: "Strong (Highly Recommend)", color: "text-blue-600", desc: "You showed great technical depth and confidence. You have a very high chance of clearing this round." };
    if (score >= 55) return { label: "Moderate (Borderline)", color: "text-amber-600", desc: "You have basic competency but may face stiff competition. Polishing your communication will help." };
    return { label: "Low (Requires Retraining)", color: "text-rose-600", desc: "Based on this session, you are not yet ready for this role. We recommend more practice with the AI." };
};

const formatIdealAnswer = (text) => {
    if (!text || text === "pending") return "Model explanation not generated.";
    try {
        let cleanText = text.trim();
        // If the AI accidentally returned nested JSON string instead of raw text, extract it
        if (cleanText.startsWith('{') && cleanText.endsWith('}')) {
            const parsed = JSON.parse(cleanText);
            return parsed.idealAnswer || parsed.explanation || parsed.answer || cleanText;
        }
        return cleanText;
    } catch (e) { return text; }
};

function SessionReview() {
    const { sessionId } = useParams();
    const dispatch = useDispatch();
    const { activeSession, isLoading } = useSelector(state => state.sessions);

    useEffect(() => {
        dispatch(getSessionById(sessionId));
    }, [dispatch, sessionId]);

    if (isLoading) return <div className="text-center py-20 font-black text-teal-600 animate-pulse tracking-[0.2em] uppercase">Generating Proctored Report...</div>;

    if (!activeSession || activeSession.status !== 'completed') {
        return (
            <div className="max-w-xl mx-auto mt-20 p-10 bg-white rounded-[3rem] shadow-2xl text-center border border-slate-100">
                <h2 className="text-2xl font-black text-slate-800 mb-4 tracking-tighter uppercase">Analyzing Session...</h2>
                <p className="text-slate-500 mb-8 font-medium">Please wait while our AI completes the final behavioral and technical assessment.</p>
                <Link to="/" className="inline-block bg-teal-600 text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl transition hover:bg-teal-700 active:scale-95 text-sm">Return Home</Link>
            </div>
        );
    }

    const { overallScore, metrics, roundType, questions, startTime, endTime, violations = 0, atsScore = 0, companyName = 'Unknown Company', jdSummary = '' } = activeSession;
    const finalMetrics = metrics || {};
    const integrityScore = Math.max(100 - (violations * 5), 20);
    const selectionOdds = getSelectionOdds(overallScore);

    const barData = {
        labels: questions.map((_, i) => `Q${i + 1}`),
        datasets: [{
            label: 'Score',
            data: questions.map(q => q.technicalScore || 0),
            backgroundColor: questions.map(q => (q.technicalScore || 0) > 70 ? '#10b981' : '#f59e0b'),
            borderRadius: 12,
        }],
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8 sm:space-y-12 animate-in fade-in duration-1000 bg-slate-50/30 font-sans">

            {/* HEADER & TOP STATS */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                       <span className="w-3 h-3 bg-teal-500 rounded-full"></span>
                       <span className="text-teal-600 font-black uppercase tracking-[0.3em] text-[10px]">Session Analysis Report</span>
                    </div>
                    <h1 className="text-3xl sm:text-6xl font-black text-slate-900 tracking-tighter uppercase leading-none break-words overflow-wrap-anywhere">
                        {companyName} <span className="text-slate-300 font-light block sm:inline">({roundType === 'tech-1' ? 'Tech Round 1' : roundType === 'tech-2' ? 'Tech Round 2' : 'HR Round'})</span>
                    </h1>
                    {jdSummary && (
                        <p className="mt-4 text-sm font-medium text-slate-500 max-w-2xl bg-slate-100 p-3 rounded-xl border border-slate-200 shadow-inner">
                            <span className="font-bold text-slate-700">JD Summary: </span>
                            {jdSummary}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-4 bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Final Scrape</span>
                    <span className="text-5xl font-black text-teal-600 tracking-tighter">{overallScore}%</span>
                </div>
            </div>

            {/* EXPANDED STATS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                {[
                    { label: 'Integrity', value: `${integrityScore}%`, color: integrityScore < 80 ? 'rose' : 'emerald', desc: `${violations} Violations` },
                    { label: 'Technical', value: `${finalMetrics.avgTechnical}%`, color: 'slate', desc: 'Average depth' },
                    { label: 'Communication', value: `${finalMetrics.avgConfidence}%`, color: 'slate', desc: 'Clarity & Confidence' },
                    { label: 'Interview Time', value: formatDuration(startTime, endTime, activeSession.pauseTimeMS || 0), color: 'slate', desc: 'Active Session' },
                    { label: 'Selection Chance', value: selectionOdds.label.split('(')[0], color: 'slate', desc: 'Market Probability' },
                ].map((stat, i) => (
                    <div key={i} className={`bg-white p-6 rounded-[2.5rem] shadow-sm border-t-8 border-slate-900`}>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{stat.label}</p>
                        <p className="text-3xl font-black text-slate-900 mt-2 tracking-tighter">{stat.value}</p>
                        <p className={`text-[10px] font-bold mt-2 uppercase text-slate-400`}>{stat.desc}</p>
                    </div>
                ))}

                <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between group hover:border-teal-200 transition-all cursor-default">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">ATS Score</p>
                    <p className={`text-3xl font-black mt-2 tracking-tighter ${atsScore >= 75 ? 'text-emerald-500' : 'text-orange-500'}`}>{atsScore}%</p>
                    <p className="text-[10px] font-bold mt-2 uppercase text-slate-400">Match against JD</p>
                </div>
            </div>

            {/* SELECTION PREDICTION BAR */}
            <div className="bg-white p-5 sm:p-10 rounded-[3.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-10">
                <div className="flex-1">
                   <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Market Probability Assessment</h3>
                   <div className="flex items-center gap-4">
                      <span className={`text-3xl font-black ${selectionOdds.color}`}>{selectionOdds.label}</span>
                   </div>
                   <p className="text-slate-500 mt-4 text-sm font-medium leading-relaxed">{selectionOdds.desc}</p>
                </div>
                <div className="w-full md:w-64 h-3 bg-slate-100 rounded-full overflow-hidden relative">
                    <div className="h-full bg-teal-500 transition-all duration-1000" style={{ width: `${overallScore}%` }}></div>
                </div>
            </div>

            {/* PERFORMANCE CHART */}
            <div className="bg-white p-5 sm:p-10 rounded-3xl sm:rounded-[3.5rem] shadow-sm border border-slate-100">
                <h3 className="text-xs font-black text-slate-400 mb-8 uppercase tracking-[0.3em]">Adaptive Question Matrix</h3>
                <div className="h-64">
                    <Bar
                        data={barData}
                        options={{
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                y: { beginAtZero: true, max: 100, grid: { color: '#f1f5f9' } },
                                x: { grid: { display: false } }
                            }
                        }}
                    />
                </div>
            </div>

            {/* QUESTION INTELLIGENCE - FULL DISCLOSURE */}
            <div className="space-y-10">
                <div className="flex items-center gap-4 px-4">
                   <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-xl font-black italic">✓</div>
                   <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Individual Performance Grid</h3>
                </div>
                
                <div className="space-y-10">
                    {questions.map((q, index) => (
                        <div key={index} className="bg-white rounded-3xl sm:rounded-[3.5rem] border border-slate-100 shadow-sm overflow-hidden group hover:shadow-2xl transition-all duration-1000">
                            <div className="p-4 sm:p-10 space-y-6 sm:space-y-8">
                                {/* Header */}
                                <div className="flex flex-col lg:flex-row justify-between items-start gap-6 border-b border-slate-50 pb-8">
                                    <h4 className="text-base sm:text-xl font-bold text-slate-800 leading-snug flex-1">
                                        <span className="text-teal-500 font-black italic mr-3">Q{index + 1}.</span> {q.questionText}
                                    </h4>
                                    <div className="flex gap-2">
                                        <div className="px-5 py-2 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 font-black text-xs uppercase tracking-widest">Tech: {q.technicalScore}%</div>
                                        <div className="px-5 py-2 rounded-2xl bg-blue-50 text-blue-700 border border-blue-100 font-black text-xs uppercase tracking-widest">Comm: {q.confidenceScore}%</div>
                                    </div>
                                </div>

                                {/* Comparison Grid */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] block ml-2 text-center">Your Response</label>
                                        <div className="bg-slate-50 rounded-3xl sm:rounded-[2.5rem] p-5 sm:p-8 border border-slate-100 min-h-[150px] space-y-4">
                                            {q.userSubmittedCode && (
                                                <pre className="text-[11px] font-mono text-slate-700 bg-white p-4 rounded-xl border border-slate-200 overflow-x-auto whitespace-pre-wrap">{q.userSubmittedCode}</pre>
                                            )}
                                            {q.userAnswerText && <p className="text-xs text-slate-600 leading-relaxed italic">"{q.userAnswerText}"</p>}
                                            {!q.userAnswerText && !q.userSubmittedCode && <p className="text-slate-400 italic text-xs text-center">No record.</p>}
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-teal-600 uppercase tracking-[0.3em] block ml-2 text-center">AI Ideal Answer</label>
                                        <div className="bg-slate-900 text-slate-300 rounded-3xl sm:rounded-[2.5rem] p-5 sm:p-8 min-h-[150px] shadow-inner text-xs sm:text-sm leading-relaxed overflow-x-auto prose-sm prose-slate prose-invert">
                                            <ReactMarkdown 
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    code({node, inline, className, children, ...props}) {
                                                        const match = /language-(\w+)/.exec(className || '')
                                                        return !inline && match ? (
                                                        <SyntaxHighlighter
                                                            style={vscDarkPlus}
                                                            language={match[1]}
                                                            PreTag="div"
                                                            className="rounded-xl !my-4 !bg-slate-950 border border-slate-800"
                                                            {...props}
                                                        >
                                                            {String(children).replace(/\n$/, '')}
                                                        </SyntaxHighlighter>
                                                        ) : (
                                                        <code className="bg-slate-800 text-teal-300 px-1.5 py-0.5 rounded-md text-xs font-mono" {...props}>
                                                            {children}
                                                        </code>
                                                        )
                                                    },
                                                    h1: ({node, ...props}) => <h1 className="text-lg sm:text-xl font-bold text-white mb-4 mt-6 border-b border-slate-700 pb-2" {...props} />,
                                                    h2: ({node, ...props}) => <h2 className="text-base sm:text-lg font-bold text-teal-400 mb-3 mt-5" {...props} />,
                                                    h3: ({node, ...props}) => <h3 className="text-sm sm:text-base font-bold text-slate-200 mb-2 mt-4" {...props} />,
                                                    p: ({node, ...props}) => <p className="mb-4 last:mb-0 text-xs sm:text-sm" {...props} />,
                                                    ul: ({node, ...props}) => <ul className="list-disc ml-6 mb-4 space-y-1 text-slate-300" {...props} />,
                                                    ol: ({node, ...props}) => <ol className="list-decimal ml-6 mb-4 space-y-1 text-slate-300" {...props} />,
                                                    li: ({node, ...props}) => <li className="pl-1" {...props} />
                                                }}
                                            >
                                                {formatIdealAnswer(q.idealAnswer)}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                </div>

                                {/* AI Feedback */}
                                {q.aiFeedback && (
                                    <div className="space-y-3 pt-6 border-t border-slate-100 mt-6">
                                        <label className="text-[10px] font-black text-rose-500 uppercase tracking-[0.3em] block ml-2">AI Feedback</label>
                                        <div className="bg-rose-50 text-rose-700 rounded-[2rem] p-6 border border-rose-100 text-xs font-medium leading-relaxed">
                                            {q.aiFeedback}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* INTEGRITY STATUS BOX */}
            <div className={`p-6 sm:p-10 rounded-3xl sm:rounded-[3.5rem] border ${violations > 0 ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'} text-center`}>
                <h4 className={`text-2xl font-black uppercase tracking-tighter mb-4 ${violations > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {violations > 0 ? 'Security Incident Logged' : 'Integrity Verified'}
                </h4>
                <p className={`text-sm leading-relaxed max-w-3xl mx-auto ${violations > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {violations > 0 
                      ? `Our AI Proctor detected ${violations} instances of misbehavior, including tab switches or unauthorized object detection (cell phone / face loss). These events have been factored into your final "Integrity Score" and have influenced your overall selection probability.`
                      : 'Zero behavioral anomalies detected. Candidate maintained full compliance with professional proctoring standards during the entire session.'
                    }
                </p>
                <div className="mt-6 sm:mt-8 flex flex-wrap justify-center gap-4 sm:gap-6">
                    <div className="px-4 sm:px-6 py-2 bg-white rounded-full border border-slate-200 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Tab Switches: Logged</div>
                    <div className="px-4 sm:px-6 py-2 bg-white rounded-full border border-slate-200 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone Detection: Active</div>
                    <div className="px-4 sm:px-6 py-2 bg-white rounded-full border border-slate-200 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Face Loss: Monitored</div>
                </div>
            </div>

        </div>
    );
}

export default SessionReview;