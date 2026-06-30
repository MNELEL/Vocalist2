import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { useAppStore } from '../store/useAppStore';
import { Mic, Users, Play, Activity } from 'lucide-react';

export default function Dashboard() {
  const { setActiveTab } = useAppStore();

  const profileCount = useLiveQuery(() => db.voiceProfiles.count()) || 0;
  const draftCount = useLiveQuery(() => db.audioDrafts.count()) || 0;
  const queueCount = useLiveQuery(() => db.generationQueue.where('status').equals('pending').count()) || 0;
  const reportCount = useLiveQuery(() => db.diagnosisReports.count()) || 0;

  const tools = [
    {
      title: 'הקלטת שמע',
      description: 'לכוד אודיו באיכות גבוהה לשיבוט קולי',
      icon: Mic,
      tab: 'record' as const,
      stat: `${draftCount} טיוטות`,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      title: 'פרופילי קול',
      description: 'נהל והגדר את מודלי הקול שלך',
      icon: Users,
      tab: 'profiles' as const,
      stat: `${profileCount} פרופילים`,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
    {
      title: 'אולפן סינתזה',
      description: 'צור דיבור באמצעות פרופילי קול מותאמים אישית',
      icon: Play,
      tab: 'synthesis' as const,
      stat: `${queueCount} בתור`,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
    },
    {
      title: 'לוח ניתוח',
      description: 'צלילה עמוקה למדדי דיבור ובהירות',
      icon: Activity,
      tab: 'analysis' as const,
      stat: `${reportCount} דוחות`,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">לוח כלים</h1>
        <p className="text-muted-foreground mt-2">
          נהל את סביבת העבודה שלך לשיבוט קולי וקבל גישה לתכונות פרימיום.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Card 
              key={tool.title} 
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setActiveTab(tool.tab)}
            >
              <CardHeader className="pb-2">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${tool.bg} ${tool.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <CardTitle className="text-lg">{tool.title}</CardTitle>
                <CardDescription>{tool.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-medium text-muted-foreground">
                  {tool.stat}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
