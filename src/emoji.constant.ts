export const EMOJIS = {
  BLADE: '<:blade:1400294133263892500>',
  KNIGHT: '<:knight:1400294158857666560>',
  RANGER: '<:ranger:1400294189941657641>',
  JESTER: '<:jester:1400294149361762416>',
  PSYKEEPER: '<:psykeeper:1400294180814585876>',
  ELEMENTOR: '<:elementor:1400294141627465848>',
  BILLPOSTER: '<:billposter:1400294118067929222>',
  RINGMASTER: '<:ringmaster:1400294197113655297>',
};

// Extract emoji IDs for easier access
export const EMOJI_IDS = {
  BLADE: '1400294133263892500',
  KNIGHT: '1400294158857666560',
  RANGER: '1400294189941657641',
  JESTER: '1400294149361762416',
  PSYKEEPER: '1400294180814585876',
  ELEMENTOR: '1400294141627465848',
  BILLPOSTER: '1400294118067929222',
  RINGMASTER: '1400294197113655297',
};

// Map emoji ID to job class name
export const EMOJI_ID_TO_JOB_CLASS: { [key: string]: string } = {
  '1400294133263892500': 'Blade',
  '1400294158857666560': 'Knight',
  '1400294189941657641': 'Ranger',
  '1400294149361762416': 'Jester',
  '1400294180814585876': 'Psykeeper',
  '1400294141627465848': 'Elementor',
  '1400294118067929222': 'Billposter',
  '1400294197113655297': 'Ringmaster',
};

// Job class registration info
export const JOB_CLASS_INFO = [
  {
    name: 'blade',
    jobClass: 'Blade',
    iconPath: './src/icons/blade.png',
    emojiId: EMOJI_IDS.BLADE,
  },
  {
    name: 'knight',
    jobClass: 'Knight',
    iconPath: './src/icons/knight.png',
    emojiId: EMOJI_IDS.KNIGHT,
  },
  {
    name: 'ranger',
    jobClass: 'Ranger',
    iconPath: './src/icons/ranger.png',
    emojiId: EMOJI_IDS.RANGER,
  },
  {
    name: 'jester',
    jobClass: 'Jester',
    iconPath: './src/icons/jester.png',
    emojiId: EMOJI_IDS.JESTER,
  },
  {
    name: 'psykeeper',
    jobClass: 'Psykeeper',
    iconPath: './src/icons/psychikeeper.png',
    emojiId: EMOJI_IDS.PSYKEEPER,
  },
  {
    name: 'elementor',
    jobClass: 'Elementor',
    iconPath: './src/icons/elementor.png',
    emojiId: EMOJI_IDS.ELEMENTOR,
  },
  {
    name: 'billposter',
    jobClass: 'Billposter',
    iconPath: './src/icons/billposter.png',
    emojiId: EMOJI_IDS.BILLPOSTER,
  },
  {
    name: 'ringmaster',
    jobClass: 'Ringmaster',
    iconPath: './src/icons/ringmaster.png',
    emojiId: EMOJI_IDS.RINGMASTER,
  },
];

export const ATTENDANCE_EMOJIS = {
  YES: '✅',
  NO: '❌',
};
