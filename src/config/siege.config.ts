export const SIEGE_CONFIG = {
  JOB_CLASS_MAX_SLOTS: {
    Blade: 2,
    Knight: 2,
    Ranger: 2,
    Jester: 2,
    Psykeeper: 2,
    Elementor: 2,
    Billposter: 2,
    Ringmaster: 2,
  },
  JOB_CLASSES: [
    'Blade',
    'Knight',
    'Ranger',
    'Jester',
    'Psykeeper',
    'Elementor',
    'Billposter',
    'Ringmaster',
  ] as const,
};

export type JobClass = (typeof SIEGE_CONFIG.JOB_CLASSES)[number];