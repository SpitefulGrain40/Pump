import { useState, useEffect } from 'react';
import { LayoutDashboard, Utensils, Calendar, Brain, MoreHorizontal, MessageCircle, TrendingUp, Settings, X, ChevronDown } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Coach from './components/Coach';
import Schedule from './components/Schedule';
import Progress from './components/Progress';
import SettingsView from './components/Settings';
import Nutrition from './components/Nutrition';
import Doc from './components/Doc';
import OnboardingWizard from './components/OnboardingWizard';
import { useUserProfile } from './hooks/useUserProfile';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'nutrition', label: 'Food', icon: Utensils },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'doc', label: 'Doc', icon: Brain },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

const MORE_ITEMS = [
  { id: 'coach', label: 'Coach', icon: MessageCircle, desc: 'AI fitness coach' },
  { id: 'progress', label: 'Progress', icon: TrendingUp, desc: 'Charts & stats' },
  { id: 'settings', label: 'Settings', icon: Settings, desc: 'Profile & config' },
];

function App() {
  const { profile } = useUserProfile();
  const needsOnboarding = !profile.onboardingComplete;

  const [activeView, setActiveView] = useState(() => {
    if (needsOnboarding) return 'onboarding';
    return 'dashboard';
  });
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);
  const [showCoachModal, setShowCoachModal] = useState(false);

  const handleOnboardingComplete = () => setActiveView('coach');
  const handleOnboardingSkip = () => setActiveView('settings');

  useEffect(() => {
    if (needsOnboarding && activeView === 'dashboard') {
      setActiveView('onboarding');
    }
  }, [needsOnboarding, activeView]);

  const handleNavClick = (id) => {
    if (id === 'more') {
      setShowMoreDrawer(true);
    } else {
      setActiveView(id);
      setShowMoreDrawer(false);
      setShowCoachModal(false);
    }
  };

  const handleMoreItemClick = (id) => {
    setActiveView(id);
    setShowMoreDrawer(false);
    setShowCoachModal(false);
  };

  const handleCoachBubbleClick = () => {
    setShowCoachModal(true);
    setShowMoreDrawer(false);
  };

  const renderView = () => {
    if (activeView === 'onboarding') return <OnboardingWizard onComplete={handleOnboardingComplete} onSkip={handleOnboardingSkip} />;
    switch (activeView) {
      case 'dashboard': return <Dashboard onNavigate={setActiveView} onOpenCoach={() => setShowCoachModal(true)} />;
      case 'nutrition': return <Nutrition />;
      case 'coach': return <Coach />;
      case 'schedule': return <Schedule onNavigate={setActiveView} onOpenCoach={() => setShowCoachModal(true)} />;
      case 'progress': return <Progress onNavigate={setActiveView} />;
      case 'settings': return <SettingsView />;
      case 'doc': return <Doc />;
      default: return <Dashboard onNavigate={setActiveView} />;
    }
  };

  if (activeView === 'onboarding') {
    return (
      <div className="flex flex-col h-full bg-bg">
        <OnboardingWizard onComplete={handleOnboardingComplete} onSkip={handleOnboardingSkip} />
      </div>
    );
  }

  // Hide floating bubble on doc, settings, onboarding, and when coach modal is open
  // Also hide when navigated to coach via More drawer
  const showCoachBubble = activeView !== 'doc' && activeView !== 'coach' && activeView !== 'settings' && activeView !== 'onboarding' && !showCoachModal;

  return (
    <div className="flex flex-col h-full bg-bg">
      <main className="flex-1 overflow-y-auto pb-20">
        {renderView()}
      </main>

      {/* Floating Coach bubble */}
      {showCoachBubble && (
        <button
          onClick={handleCoachBubbleClick}
          className="fixed bottom-20 right-4 z-40 w-12 h-12 bg-accent rounded-full flex items-center justify-center shadow-lg"
          title="Ask Coach"
        >
          <MessageCircle size={22} className="text-bg" />
        </button>
      )}

      {/* Coach modal overlay — slide up over current tab */}
      {showCoachModal && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-bg animate-slide-up">
          <div className="flex items-center justify-between px-4 pt-3 pb-1 border-b border-border">
            <button
              onClick={() => setShowCoachModal(false)}
              className="p-2 text-text-muted hover:text-text rounded-lg"
              aria-label="Close Coach"
            >
              <ChevronDown size={22} />
            </button>
            <span className="text-xs text-text-muted">Coach</span>
            <div className="w-10" />
          </div>
          <div className="flex-1 overflow-hidden">
            <Coach onClose={() => setShowCoachModal(false)} />
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-surface border-t border-border flex items-center justify-around px-2 z-50">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = id === 'more' ? showMoreDrawer : activeView === id;
          return (
            <button
              key={id}
              onClick={() => handleNavClick(id)}
              className={`relative flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive ? 'text-accent' : 'text-text-muted hover:text-text'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-xs mt-1 ${isActive ? 'font-medium' : ''}`}>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* More drawer */}
      {showMoreDrawer && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setShowMoreDrawer(false)}
          />
          <div className="fixed bottom-16 left-0 right-0 z-50 bg-surface border-t border-border rounded-t-2xl p-4 pb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-text-muted">More</span>
              <button onClick={() => setShowMoreDrawer(false)} className="p-1 text-text-muted">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2">
              {MORE_ITEMS.map(({ id, label, icon: Icon, desc }) => (
                <button
                  key={id}
                  onClick={() => handleMoreItemClick(id)}
                  className={`w-full flex items-center gap-4 p-3 rounded-xl text-left transition-colors ${
                    activeView === id ? 'bg-accent/10 text-accent' : 'bg-bg text-text hover:bg-surface-light'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    activeView === id ? 'bg-accent/20' : 'bg-surface-light'
                  }`}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{label}</div>
                    <div className="text-xs text-text-muted">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
