import { useQuery } from '@tanstack/react-query';
import { CalendarClock, HandHeart, Users, UsersRound } from 'lucide-react';
import BirthdayWidget from '@/features/dashboard/BirthdayWidget';
import { countUpcomingEvents } from '@/features/dashboard/dashboard.utils';
import NotificationWidget from '@/features/dashboard/NotificationWidget';
import RunScoringButton from '@/features/dashboard/RunScoringButton';
import StatCard from '@/features/dashboard/StatCard';
import StatusChart from '@/features/dashboard/StatusChart';
import UpcomingEventsWidget from '@/features/dashboard/UpcomingEventsWidget';
import { listCellGroups } from '@/features/cellgroup/cellgroup.api';
import { listEvents } from '@/features/event/event.api';
import { listJemaat } from '@/features/jemaat/jemaat.api';
import { listVolunteerTypes } from '@/features/volunteer/volunteer.api';
import { useAuthStore } from '@/store/auth.store';

export default function DashboardPage() {
  const peran = useAuthStore((s) => s.peran);
  const isLeader = peran === 'LEADER';

  // Query per sumber data dengan queryKey terpisah agar skeleton dan error
  // per-card independen (partial failure isolation).
  const jemaatQuery = useQuery({
    queryKey: ['dashboard', 'jemaat'],
    queryFn: () => listJemaat({ limit: 1000 }),
  });

  const cellGroupQuery = useQuery({
    queryKey: ['dashboard', 'cellgroups'],
    queryFn: () => listCellGroups({ limit: 1000 }),
  });

  const eventQuery = useQuery({
    queryKey: ['dashboard', 'events'],
    queryFn: () => listEvents(),
  });

  const volunteerTypeQuery = useQuery({
    queryKey: ['dashboard', 'volunteer-types'],
    queryFn: () => listVolunteerTypes(),
  });

  const activeVolunteerTypesCount = volunteerTypeQuery.data?.filter((v) => v.is_active).length ?? 0;
  const upcomingEventsCount = eventQuery.data ? countUpcomingEvents(eventQuery.data) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-600">Ringkasan data GODS DNA Church Management System.</p>
        </div>
        {isLeader && <RunScoringButton />}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Jemaat Aktif"
          value={jemaatQuery.data?.length ?? 0}
          icon={Users}
          chipClass="bg-modul-jemaat/15"
          iconClass="text-modul-jemaat"
          accentClass="border-l-modul-jemaat"
          isLoading={jemaatQuery.isLoading}
          isError={jemaatQuery.isError}
        />
        <StatCard
          label="Cell Group Aktif"
          value={cellGroupQuery.data?.length ?? 0}
          icon={UsersRound}
          chipClass="bg-modul-cellgroup/15"
          iconClass="text-modul-cellgroup"
          accentClass="border-l-modul-cellgroup"
          isLoading={cellGroupQuery.isLoading}
          isError={cellGroupQuery.isError}
        />
        <StatCard
          label="Event Mendatang"
          value={upcomingEventsCount}
          icon={CalendarClock}
          chipClass="bg-modul-event/15"
          iconClass="text-modul-event"
          accentClass="border-l-modul-event"
          isLoading={eventQuery.isLoading}
          isError={eventQuery.isError}
        />
        <StatCard
          label="Jenis Volunteer Aktif"
          value={activeVolunteerTypesCount}
          icon={HandHeart}
          chipClass="bg-modul-volunteer/15"
          iconClass="text-modul-volunteer"
          accentClass="border-l-modul-volunteer"
          isLoading={volunteerTypeQuery.isLoading}
          isError={volunteerTypeQuery.isError}
        />
      </div>

      <StatusChart data={jemaatQuery.data} isLoading={jemaatQuery.isLoading} isError={jemaatQuery.isError} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {isLeader && <NotificationWidget />}
        <UpcomingEventsWidget
          data={eventQuery.data}
          isLoading={eventQuery.isLoading}
          isError={eventQuery.isError}
        />
        <BirthdayWidget data={jemaatQuery.data} isLoading={jemaatQuery.isLoading} isError={jemaatQuery.isError} />
      </div>
    </div>
  );
}