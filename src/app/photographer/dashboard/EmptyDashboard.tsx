"use client";

import { FirstProjectOnboarding } from "@/components/photographer/FirstProjectOnboarding";

interface EmptyDashboardProps {
  onCreateProject: () => void;
}

export default function EmptyDashboard({ onCreateProject }: EmptyDashboardProps) {
  return (
    <main className="flex min-h-[calc(100dvh-4rem)] w-full items-center justify-center bg-background px-6 py-16 font-sans md:min-h-screen md:px-10 md:py-20">
      <FirstProjectOnboarding
        onCreateProject={onCreateProject}
        className="md:-translate-y-8"
      />
    </main>
  );
}
