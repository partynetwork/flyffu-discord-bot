export const SIEGE_CONFIG = {
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
