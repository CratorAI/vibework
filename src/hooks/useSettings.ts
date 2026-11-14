import { useState, useEffect, useCallback } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { settingsApi } from '@/tauri';

export const useSettings = () => {
  const [notificationsEnabled, setNotificationsEnabledState] = useState<boolean>(true);
  const [defaultWorkingDirectory, setDefaultWorkingDirectoryState] = useState<string>("");
  const [appVersion, setAppVersion] = useState<string>("");
  const [onboardingCompleted, setOnboardingCompletedState] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const [enabled, workDir, onboarded, version] = await Promise.all([
        settingsApi.getNotificationsEnabled(),
        settingsApi.getDefaultWorkingDirectory(),
        settingsApi.getOnboardingCompleted(),
        getVersion().catch(() => "Unknown"),
      ]);
      setNotificationsEnabledState(enabled);
      setDefaultWorkingDirectoryState(workDir);
      setOnboardingCompletedState(onboarded);
      setAppVersion(version);
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
    const previousValue = notificationsEnabled;
    setNotificationsEnabledState(enabled);
    try {
      await settingsApi.setNotificationsEnabled(enabled);
    } catch (error) {
      console.error("Failed to save notifications setting:", error);
      setNotificationsEnabledState(previousValue);
    }
  }, [notificationsEnabled]);

  const setDefaultWorkingDirectory = useCallback(async (directory: string) => {
    const previousValue = defaultWorkingDirectory;
    setDefaultWorkingDirectoryState(directory);
    try {
      await settingsApi.setDefaultWorkingDirectory(directory);
    } catch (error) {
      console.error("Failed to save default working directory:", error);
      setDefaultWorkingDirectoryState(previousValue);
    }
  }, [defaultWorkingDirectory]);

  const setOnboardingCompleted = useCallback(async (completed: boolean) => {
    const previousValue = onboardingCompleted;
    setOnboardingCompletedState(completed);
    try {
      await settingsApi.setOnboardingCompleted(completed);
    } catch (error) {
      console.error("Failed to save onboarding setting:", error);
      setOnboardingCompletedState(previousValue);
    }
  }, [onboardingCompleted]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    notificationsEnabled,
    setNotificationsEnabled,
    defaultWorkingDirectory,
    setDefaultWorkingDirectory,
    onboardingCompleted,
    setOnboardingCompleted,
    appVersion,
    isLoading,
    refreshSettings: loadSettings,
  };
};
