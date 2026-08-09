'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import {
  BrainCircuit, Users, TrendingUp, TrendingDown, Minus, BarChart2,
  AlertTriangle, X,
} from 'lucide-react';
import { db } from '@/app/lib/firebase';
import { InstituteData, InstituteInsights, StudentBehaviorProfile, CATSection } from '@/app/lib/catTypes';

const SECTIONS: CATSection[] = ['VARC', 'DILR', 'QA'];

const SECTION_BADGE: Record<CATSection, string> = {
  VARC: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  DILR: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  QA: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

const ALERT_STYLE: Record<InstituteInsights['studentAlerts'][number]['type'], { icon: typeof TrendingDown; classes: string; label: string }> = {
  declining: { icon: TrendingDown, classes: 'text-red-400 bg-red-500/10 border-red-500/20', label: 'Declining' },
  stagnating: { icon: Minus, classes: 'text-orange-400 bg-orange-500/10 border-orange-500/20', label: 'Stagnating' },
  breakthrough: { icon: TrendingUp, classes: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', label: 'Breakthrough' },
};

function accuracyColor(acc: number): string {
  if (acc < 0.3) return 'bg-red-500/70';
  if (acc < 0.45) return 'bg-orange-500/60';
  if (acc < 0.6) return 'bg-amber-500/50';
  return 'bg-emerald-500/40';
}

export default function InstitutePage() {
  const [instituteId, setInstituteId] = useState<string | null>(null);
  const [institute, setInstitute] = useState<InstituteData | null>(null);
  const [insights, setInsights] = useState<InstituteInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<StudentBehaviorProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInstituteId(params.get('instituteId') || 'demo');
  }, []);

  useEffect(() => {
    if (!instituteId) return;
    (async () => {
      setLoading(true);
      const [instituteSnap, insightsSnap] = await Promise.all([
        getDoc(doc(db, 'institutes', instituteId)),
        getDoc(doc(db, 'instituteInsights', instituteId)),
      ]);
      setInstitute(instituteSnap.exists() ? (instituteSnap.data() as InstituteData) : null);
      setInsights(insightsSnap.exists() ? (insightsSnap.data() as InstituteInsights) : null);
      setLoading(false);
    })();
  }, [instituteId]);

  const openStudent = async (studentId: string) => {
    setSelectedStudentId(studentId);
    setSelectedProfile(null);
    setProfileLoading(true);
    const snap = await getDoc(doc(db, 'studentProfiles', studentId));
    setSelectedProfile(snap.exists() ? (snap.data() as StudentBehaviorProfile) : null);
    setProfileLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading institute dashboard...</div>
      </div>
    );
  }

  const plan = institute?.plan ?? 'starter';
  const messagesLimit = institute?.messagesLimit ?? 0;
  const messagesUsed = institute?.messagesUsed ?? 0;
  const creditPct = messagesLimit > 0 ? Math.min(100, Math.round((messagesUsed / messagesLimit) * 100)) : 0;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <BrainCircuit size={18} className="text-amber-400" />
            <span className="font-bold text-white tracking-tight">
              {institute?.name ?? `Institute (${instituteId})`}
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-400 uppercase">
              {plan}
            </span>
          </div>
          {institute && (
            <div className="flex items-center gap-2 text-xs text-gray-400 min-w-[180px]">
              <span className="whitespace-nowrap">{messagesUsed}/{messagesLimit} msgs</span>
              <div className="h-1.5 w-32 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${creditPct > 90 ? 'bg-red-500' : creditPct > 70 ? 'bg-orange-500' : 'bg-amber-500'}`}
                  style={{ width: `${creditPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {!institute && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 text-sm text-gray-400">
            No <span className="font-mono text-gray-300">institutes/{instituteId}</span> document found yet — showing insights only. Create one in Firestore to set the name, plan, and credit limits.
          </div>
        )}

        {/* Batch overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <Users size={14} /> Active Students
            </div>
            <div className="text-3xl font-mono font-bold text-white">{insights?.activeStudents ?? 0}</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <BarChart2 size={14} /> Avg Score
            </div>
            <div className="text-3xl font-mono font-bold text-amber-400">{insights?.avgScore ?? 0}</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <AlertTriangle size={14} /> Weak Areas Flagged
            </div>
            <div className="text-3xl font-mono font-bold text-red-400">{insights?.batchWeakAreas?.length ?? 0}</div>
          </motion.div>
        </div>

        {/* Weak area heatmap */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Batch Weak Areas</h2>
          {insights && insights.batchWeakAreas.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {insights.batchWeakAreas.map((w, i) => (
                <motion.div
                  key={`${w.section}-${w.chapter}-${w.questionType}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 flex items-center gap-4"
                >
                  <div className={`w-14 h-14 rounded-lg flex items-center justify-center font-mono font-bold text-sm ${accuracyColor(w.avgAccuracy)}`}>
                    {Math.round(w.avgAccuracy * 100)}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-semibold border ${SECTION_BADGE[w.section]}`}>{w.section}</span>
                      <span className="text-sm font-semibold text-white truncate">{w.chapter}</span>
                    </div>
                    <p className="text-xs text-gray-500">{w.questionType} · {w.studentCount} student{w.studentCount === 1 ? '' : 's'} struggling</p>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-6 text-center text-sm text-gray-500">
              Not enough mock data yet — weak areas surface once students have taken a few mocks each.
            </div>
          )}
        </div>

        {/* Student alerts */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Student Alerts</h2>
          {insights && insights.studentAlerts.length > 0 ? (
            <div className="rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Trend</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.studentAlerts.map(a => {
                    const style = ALERT_STYLE[a.type];
                    const Icon = style.icon;
                    return (
                      <tr
                        key={a.studentId}
                        onClick={() => openStudent(a.studentId)}
                        className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 font-semibold text-white">{a.studentName}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-semibold border ${style.classes}`}>
                            <Icon size={11} /> {style.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400">{a.detail}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-6 text-center text-sm text-gray-500">
              No alerts yet — trends appear once a student has taken at least two mocks.
            </div>
          )}
        </div>

        {/* Student drill-down */}
        {selectedStudentId && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-amber-500/30 bg-gray-900/70 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">
                {insights?.studentAlerts.find(a => a.studentId === selectedStudentId)?.studentName ?? 'Student'} — Profile
              </h3>
              <button onClick={() => setSelectedStudentId(null)} className="text-gray-500 hover:text-gray-300">
                <X size={16} />
              </button>
            </div>

            {profileLoading && <div className="text-sm text-gray-400">Loading profile...</div>}

            {!profileLoading && selectedProfile && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {SECTIONS.map(sec => {
                    const s = selectedProfile.sectionStats[sec];
                    return (
                      <div key={sec} className="rounded-lg border border-gray-800 p-3">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-semibold border ${SECTION_BADGE[sec]}`}>{sec}</span>
                        <div className="mt-2 text-xs text-gray-400 space-y-1">
                          <div>Net score: <span className="text-white font-mono">{Math.round(s?.avgNetScore ?? 0)}</span></div>
                          <div>Accuracy: <span className="text-white font-mono">{Math.round((s?.avgAccuracy ?? 0) * 100)}%</span></div>
                          {s?.rushPattern && <div className="text-amber-400">Rush pattern detected</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-gray-500">{selectedProfile.mockCount} mock{selectedProfile.mockCount === 1 ? '' : 's'} recorded</div>
                {selectedProfile.skipRecommendations.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Top Skip Recommendations</div>
                    <div className="space-y-2">
                      {selectedProfile.skipRecommendations.slice(0, 3).map((r, i) => (
                        <div key={i} className="text-xs text-gray-400 rounded-lg border border-gray-800 px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded font-semibold border mr-2 ${SECTION_BADGE[r.section]}`}>{r.section}</span>
                          {r.chapter} — {r.reasoning}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!profileLoading && !selectedProfile && (
              <div className="text-sm text-gray-500">No profile data found for this student.</div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
