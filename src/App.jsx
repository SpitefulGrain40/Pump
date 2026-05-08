import { useState, useEffect } from 'react';
import { LayoutDashboard, MessageCircle, Calendar, TrendingUp, Settings, Utensils } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Coach from './components/Coach';
import Schedule from './components/Schedule';
import Progress from './components/Progress';
import SettingsView from './components/Settings';
import Nutrition from './components/Nutrition';
import OnboardingWizard from './components/OnboardingWizard';
import { useUserProfile } from './hooks/useUserProfile';
import { useSettings } from './hooks/useSettings';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'nutrition', label: 'Food', icon: Utensils },
  { id: 'coach', label: 'Coach', icon: MessageCircle },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
];

function App() {
  const { profile } = useUserProfile();
  const { isConfigured } = useSettings();
  const needsOnboarding = !profile.onboardingComplete;
  const needsApiSetup = !isConfigured();

  const [activeView, setActiveView] = useState(() => {
    if (needsApiSetup) return 'settings';
    if (needsOnboarding) return 'onboarding';
    return 'dashboard';
  });

  // When onboarding completes, go to coach to set up workout plan
  const handleOnboardingComplete = () => {
    setActiveView('coach');
  };

  // Redirect to onboarding if profile reset
  useEffect(() => {
    if (needsOnboarding && !needsApiSetup && activeView === 'dashboard') {
      setActiveView('onboarding');
    }
  }, [needsOnboarding, needsApiSetup, activeView]);

  const renderView = () => {
    // Show onboarding wizard (full screen mode handled below)
    if (activeView === 'onboarding') {
      return <OnboardingWizard onComplete={handleOnboardingComplete} />;
    }

    switch (activeView) {
      case 'dashboard':
        return <Dashboard onNavigate={setActiveView} />;
      case 'nutrition':
        return <Nutrition />;
      case 'coach':
        return <Coach />;
      case 'schedule':
        return <Schedule onNavigate={setActiveView} />;
      case 'progress':
        return <Progress onNavigate={setActiveView} />;
      case 'settings':
        return <SettingsView />;
      default:
        return <Dashboard onNavigate={setActiveView} />;
    }
  };

  // Full screen onboarding (no nav bar)
  if (activeView === 'onboarding') {
    return (
      <div className="flex flex-col h-full bg-bg">
        <OnboardingWizard onComplete={handleOnboardingComplete} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-bg">
      <main className="flex-1 overflow-y-auto pb-20">
        {renderView()}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-surface border-t border-border flex items-center justify-around px-2 z-50">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = activeView === id;
          return (
            <button
              key={id}
              onClick={() => setActiveView(id)}
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
    </div>
  );
}

export default App;
