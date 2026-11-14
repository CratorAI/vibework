import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  BarChart3,
  Calendar,
  Folder,
  FileCode,
  Layers,
  ClipboardList,
  Search,
  Newspaper,
  FileCheck,
  Scale,
  Megaphone,
  Mail,
  BookOpen,
  DollarSign,
  ListTodo,
  PieChart,
  Package,
  Users,
  Target,
  Presentation,
  TrendingUp,
  GraduationCap,
  RefreshCw,
  Compass,
  Radio,
  Database,
  Eraser,
  LineChart,
  GitCompare,
  Zap,
  UserCircle,
  UsersRound,
  Handshake,
  MessageSquare,
  Swords,
  Briefcase,
  Building2,
  Monitor,
  FolderOpen,
  Download,
  Image,
  Paperclip,
  FileSearch,
  Pencil,
  FileOutput,
  ArrowRightLeft,
  Languages,
  FileDiff,
  SpellCheck,
  Globe,
  Layout,
  LayoutDashboard,
  Smartphone,
  MailOpen,
  FormInput,
  Chrome,
  FileSpreadsheet,
  type LucideIcon
} from '@/lib/icons';
import { promptFlows, PromptFlow, PromptOption } from './promptBuilderData';

interface PromptBuilderProps {
  activeFlow: PromptFlow | null;
  onSelectFlow: (flowId: string) => void;
  onBack: () => void;
  onSelectOption: (option: PromptOption) => void;
  currentStepId: string | null;
}

const flowIconMap: Record<string, LucideIcon> = {
  file: FileText,
  chart: BarChart3,
  calendar: Calendar,
  folder: Folder,
  document: FileCode,
  prototype: Layers,
};

const optionIconMap: Record<string, LucideIcon> = {
  'word': FileText,
  'spreadsheet': FileSpreadsheet,
  'powerpoint': Presentation,
  'prd': ClipboardList,
  'research': Search,
  'article': Newspaper,
  'executive-summary': FileCheck,
  'legal-review': Scale,
  'release-notes': Megaphone,
  'email': Mail,
  'sop': BookOpen,
  'budget': DollarSign,
  'project-plan': ListTodo,
  'data-analysis': PieChart,
  'inventory': Package,
  'crm-tracker': Users,
  'okr-tracker': Target,
  'pitch-deck': Presentation,
  'quarterly-review': TrendingUp,
  'training': GraduationCap,
  'project-update': RefreshCw,
  'strategy-deck': Compass,
  'all-hands': Radio,
  'analyze': Database,
  'clean': Eraser,
  'visualize': LineChart,
  'forecast': TrendingUp,
  'compare': GitCompare,
  'automate': Zap,
  'one-on-one': UserCircle,
  'team-standup': UsersRound,
  'client-call': Handshake,
  'presentation': MessageSquare,
  'negotiation': Swords,
  'interview': Briefcase,
  'board-meeting': Building2,
  'desktop': Monitor,
  'project-files': FolderOpen,
  'downloads': Download,
  'photos': Image,
  'email-attachments': Paperclip,
  'summarize': FileSearch,
  'edit': Pencil,
  'extract': FileOutput,
  'convert': ArrowRightLeft,
  'translate': Languages,
  'compare-versions': FileDiff,
  'proofread': SpellCheck,
  'web-app': Globe,
  'landing-page': Layout,
  'dashboard': LayoutDashboard,
  'mobile-mockup': Smartphone,
  'email-template': MailOpen,
  'form-flow': FormInput,
  'chrome-extension': Chrome,
};

export const PromptBuilder: React.FC<PromptBuilderProps> = ({
  activeFlow,
  onSelectFlow,
  onBack,
  onSelectOption,
  currentStepId,
}) => {
  if (!activeFlow) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {promptFlows.map(flow => {
          const FlowIcon = flowIconMap[flow.icon] || FileText;
          return (
            <button
              key={flow.id}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted"
              onClick={() => onSelectFlow(flow.id)}
            >
              <FlowIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-ui text-foreground">{flow.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const currentStep = activeFlow.steps.find(s => s.id === currentStepId);

  if (!currentStep) {
    return null;
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex justify-between items-center mb-4">
        <span className="text-ui font-medium text-foreground">{currentStep.question}</span>
        <div className="flex gap-1">
          <button
            onClick={onBack}
            className="rounded-md p-1.5 transition-colors hover:bg-muted"
            aria-label="Go back"
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            disabled
            className="cursor-not-allowed rounded-md p-1.5 opacity-50"
            aria-label="Go forward"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {currentStep.options.map(option => {
          const OptionIcon = optionIconMap[option.id] || FileText;
          return (
            <button
              key={option.id}
              className="flex items-center gap-2 rounded-lg border bg-muted/60 px-3 py-2 text-left transition-colors hover:bg-muted"
              onClick={() => onSelectOption(option)}
            >
              <OptionIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-ui text-foreground">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
