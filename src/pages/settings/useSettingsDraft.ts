import { useEffect, useRef, useState } from 'react';
import type { BusinessSettings } from '@/domain/types';
import { useSettings } from '@/hooks/useApp';
import { useToast } from '@/components/ui/Toast';
import { saveSettings } from '@/services/settingsService';

/** Local editable copy of settings with explicit Save / Reset. */
export function useSettingsDraft() {
  const settings = useSettings();
  const toast = useToast();
  const [draft, setDraft] = useState<BusinessSettings>(settings);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  // Pick up external changes (e.g. another tab) only when nothing is being edited.
  useEffect(() => {
    if (!dirtyRef.current) setDraft(settings);
  }, [settings]);

  const set = <K extends keyof BusinessSettings>(key: K, value: BusinessSettings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };

  const save = async (patch?: Partial<BusinessSettings>) => {
    setSaving(true);
    try {
      await saveSettings({ ...draft, ...patch });
      setDirty(false);
      toast.success('Settings saved');
      return true;
    } catch (err) {
      toast.error('Settings not saved', err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(settings);
    setDirty(false);
  };

  return { draft, set, setDraft, dirty, saving, save, reset, saved: settings };
}

export type SettingsDraft = ReturnType<typeof useSettingsDraft>;
