import type { CrewId } from './crew';

/**
 * What's left behind: terminal logs, orders, and notes in people's handwriting. Each theme
 * has its own pool plus a shared one; a raid never shows the same entry twice.
 *
 * Most entries belong to one of five threads that run through every world. A thread comes
 * out slowly: an operator is shown entries they haven't read, earliest chapter first, so
 * the Blackout is a stopped clock before it is a protocol, and Channel Nine is a notice on
 * a radio-room wall long before anyone says what it is. Nothing explains everything.
 */

export type Thread = 'blackout' | 'nine' | 'stayed' | 'running' | 'fall';

export const THREADS: Record<Thread, { name: string; ru: string; blurb: string }> = {
  blackout: { name: 'THE BLACKOUT', ru: 'ЗАТЕМНЕНИЕ', blurb: 'The night the network went dark. Every clock agrees on the second.' },
  nine: { name: 'CHANNEL NINE', ru: 'ДЕВЯТЫЙ КАНАЛ', blurb: 'The channel nobody was allowed to answer.' },
  stayed: { name: 'THOSE WHO STAYED', ru: 'ОСТАВШИЕСЯ', blurb: 'The workers who were never told to go home.' },
  running: { name: 'WHY THE LIGHTS ARE ON', ru: 'ПОЧЕМУ ГОРИТ СВЕТ', blurb: 'What the power still goes to, when there is almost none.' },
  fall: { name: 'WHAT HAPPENED', ru: 'ЧТО СЛУЧИЛОСЬ', blurb: 'The Commonwealth did not fall. It stopped.' },
};

export interface LoreEntry {
  /** Stable id (saved: which ones the operator has read). */
  id: string;
  title: string;
  /** Header line: who wrote it, when. */
  from: string;
  lines: string[];
  thread?: Thread;
  /** Earlier chapters of a thread are shown first (1 = anywhere, any time). */
  chapter?: number;
  /** Handwriting on paper, found with something left behind, not a terminal. */
  note?: boolean;
  /** A crew member who has something to say about it, the first time you come home having read it. */
  react?: { crew: CrewId; line: string };
}

const SHARED: LoreEntry[] = [
  {
    id: 'clocks', thread: 'blackout', chapter: 1,
    title: 'CLOCK CALIBRATION', from: 'AUTOMATED · TIMEKEEPING',
    lines: ['Station master clock stopped at 00:00:00.000 on the night of the interruption.', 'All clocks synchronise to the master clock.', 'All clocks read 00:00:00.000.', 'Maintenance request: none. The clocks are correct.'],
    react: { crew: 'hacker', line: 'Zero, zero, zero. Every node I\'ve ever cracked stopped on the same thousandth of a second. Networks don\'t fail like that. Somebody turned them off.' },
  },
  {
    id: 'rollcall', thread: 'stayed', chapter: 2,
    title: 'ROLL CALL', from: 'PERSONNEL · DAILY',
    lines: ['Present: 3.', 'On post: 211.', 'Personnel on post may not be removed from the roll without an order from Central.', 'Roll call continues daily.'],
  },
  {
    id: 'letter_dated', thread: 'fall', chapter: 2,
    title: 'INCOMING (CENTRAL)', from: 'RELAY · RECEIVED',
    lines: ['A message from Central arrived nine days after the interruption.', 'It was the last message before the interruption, word for word.', 'Only the date had been changed.', 'We have not been able to find out who changed the date.'],
  },
  {
    id: 'net_status', thread: 'running', chapter: 1, title: 'NETWORK STATUS', from: 'AUTOMATED · NODE HEALTH',
    lines: ['UPLINK TO CENTRAL: NO CARRIER', 'LAST HANDSHAKE: 00:00:00.000 (SEE BLACKOUT PROTOCOL)', 'RETRYING. RETRYING. RETRYING.', 'Retry count exceeds display width.'],
  },
  {
    id: 'civil_notice', thread: 'fall', chapter: 1, title: 'CIVIL DEFENCE NOTICE', from: 'COMMONWEALTH MINISTRY OF ORDER',
    lines: ['Citizens are reminded that the interruption of central broadcasts is temporary.', 'Remain at your post. Continue production quotas.', 'Rumours of the dissolution of the Commonwealth are enemy propaganda.', 'This notice will repeat.'],
  },
  {
    id: 'payroll', thread: 'stayed', chapter: 1, title: 'PAYROLL', from: 'ACCOUNTS · AUTOMATED',
    lines: ['SALARY TRANSFER FAILED: CENTRAL BANK UNREACHABLE', 'SALARY TRANSFER FAILED: CENTRAL BANK UNREACHABLE', 'SALARY TRANSFER FAILED: CENTRAL BANK UNREACHABLE', 'Personal note appended: "then who are we working for"'],
  },
  {
    id: 'unsent', thread: 'stayed', chapter: 1, title: 'MESSAGE (UNSENT)', from: 'PERSONAL · DRAFTS',
    lines: ['Lena, the shuttles stopped. They say one more month.', 'I kept your letter in my locker. If someone finds this, the locker code is her birthday.', 'Tell her I stayed because I was told to.'],
  },
  {
    id: 'sec_bulletin', title: 'SECURITY BULLETIN', from: 'SITE SECURITY',
    lines: ['Scavenger activity reported in adjacent sectors.', 'They move in the dark and listen for footsteps. So should you.', 'Do not use hand lamps in corridors after the second bell.'],
  },
  {
    id: 'blackout_protocol', thread: 'blackout', chapter: 2, title: 'BLACKOUT PROTOCOL', from: 'RESTRICTED · CLEARANCE 4',
    lines: ['In the event of total loss of the central network:', '1. Seal vaults. 2. Continue the listening watch.', '3. Do not reply to any transmission on the ninth channel.', 'Whatever it says.'],
  },
];

const THEMED: Record<string, LoreEntry[]> = {
  tikhaya: [
    {
      id: 'tk_radio9', thread: 'nine', chapter: 1,
      title: 'RADIO ROOM NOTICE', from: 'SITE SIGNALS OFFICER',
      lines: ['The ninth channel is not in service.', 'Any operator found listening to the ninth channel will be reassigned.', 'It is only static.', 'If it is not static, log it, and then forget it.'],
      react: { crew: 'hacker', line: 'The radio-room notice? Everyone who grew up on a station knows you don\'t tune to nine. I tune to nine. It isn\'t static.' },
    },
    {
      id: 'tk_grid', thread: 'running', chapter: 1,
      title: 'POWER GRID', from: 'AUTOMATED · LOAD MANAGEMENT',
      lines: ['RESERVE CELLS: 3 OF 40 CHARGED', 'LOAD SHED: CANTEEN, BARRACKS, HEATING (LEVELS 2-4)', 'PRIORITY LOAD: LISTENING POST (SUBSYSTEM UNKNOWN)', 'Priority cannot be changed at this terminal.'],
    },
    {
      id: 'tk_line3', thread: 'stayed', chapter: 1, title: 'SHIFT LOG · LINE 3', from: 'FOREMAN ZHUKOV',
      lines: ['Day 212 without a supply ship. Line 3 still running.', 'Nobody ordered us to stop, so we make tractors for fields no one will plant.', 'I have forty tractors in the yard. I have no diesel. I have no farmers.', 'Tomorrow we make forty-one.'],
    },
    {
      id: 'tk_ticket', thread: 'running', chapter: 1, title: 'MAINTENANCE TICKET #4471', from: 'WORKSHOP B',
      lines: ['Press 6 hydraulic seal leaking again.', 'Replacement part requisitioned from Central: NO RESPONSE (x19).', 'Fixed it with a boot. Works fine. Do not tell the inspector.', 'Inspector has not visited in two years.'],
    },
    {
      id: 'tk_canteen', title: 'CANTEEN MENU', from: 'CANTEEN 2',
      lines: ['MONDAY: CABBAGE SOUP', 'TUESDAY: CABBAGE SOUP (THICK)', 'WEDNESDAY: RUMOUR OF MEAT', 'THURSDAY: CABBAGE SOUP. The greenhouse on level 2 is ours now. Guard it.'],
    },
    {
      id: 'tk_copper', title: 'STAFF NOTICE', from: 'PLANT DIRECTOR',
      lines: ['Theft of copper wiring from the lighting circuits must stop.', 'Every metre you take is a corridor someone walks in the dark.', 'The scavengers are not the only ones stealing.'],
    },
  ],
  merzlota: [
    {
      id: 'mz_listen', thread: 'running', chapter: 2,
      title: 'CRYO PLANT · POWER', from: 'CHIEF ENGINEER SAVINA',
      lines: ['We cut heat to the dormitories. We cut light to the mine.', 'The listening post on the ridge we cannot cut. It is not on our circuit.', 'It is not on any circuit I can find.', 'It has more power than the rest of us put together.'],
    },
    {
      id: 'mz_heating', thread: 'running', chapter: 2, title: 'HEATING SYSTEM', from: 'AUTOMATED · CRYO PLANT',
      lines: ['PRIMARY BOILER: OFFLINE', 'SECONDARY BOILER: OFFLINE', 'EMERGENCY HEAT: RESERVED FOR SHAFT 9 PUMPS', 'Crew quarters temperature: -31. Advise crew to sleep in the pump hall.'],
    },
    {
      id: 'mz_shaft9', thread: 'fall', chapter: 2, title: 'SHAFT 9 REPORT', from: 'MINE FOREMAN KAMENEV',
      lines: ['Drill head broke into a cavity at 1,140 metres. Warm air. Warm.', 'The crystals there grow in rings, like a tree. Some rings are newer than the mine.', 'Sealing the cavity until the geologists arrive.', 'The geologists are not coming. Nobody is.'],
    },
    {
      id: 'mz_sealing', thread: 'stayed', chapter: 2, title: 'SEALING ORDER', from: 'SITE COUNCIL',
      lines: ['By vote of 41 to 3 the lower levels are sealed.', 'We have heat for one ring of corridors, not two.', 'The three who voted against have gone below. May the ice be kind.'],
    },
    {
      id: 'mz_raiders', title: 'PERSONAL LOG', from: 'MINER (NAME SCRATCHED OUT)',
      lines: ['Found a raider camp on the ice road. Fires still warm. No one there.', 'They leave the fires burning so you think they are close.', 'They are close.'],
    },
  ],
  krasnaya: [
    {
      id: 'kr_orders', thread: 'running', chapter: 2, title: 'STANDING ORDERS', from: 'GARRISON COMMAND · DEPOT 4',
      lines: ['Hold the depot until relieved.', 'Do not surrender Commonwealth materiel to unauthorised persons.', 'All persons are unauthorised.', 'Orders valid until countermanded. Orders have not been countermanded.'],
    },
    {
      id: 'kr_roster', thread: 'stayed', chapter: 2, title: 'DUTY ROSTER', from: 'SERGEANT MAJOR ILYIN',
      lines: ['Watch 1: Petrov, Sayed, Orlov', 'Watch 2: Adeyemi (the Hammer), Kuznetsova, Brandt', 'Watch 3: vacant, vacant, vacant', 'Replacements requested 14 times. Stop requesting.'],
      react: { crew: 'merc', line: 'You found the Depot 4 roster. Ilyin wrote that. He crossed nobody off, and nobody crossed him off either. Leave it at that.' },
    },
    {
      id: 'kr_armoury', title: 'ARMOURY INVENTORY', from: 'QUARTERMASTER',
      lines: ['AKR-74: 212 (serviceable 190)', '5.45 BALL: 60,000 rounds. 5.45 AP: sealed in the vault, keycard with the commander.', 'Commander deceased. Keycard location unknown.', 'Do not blow the vault door. We tried. It is a very good door.'],
    },
    {
      id: 'kr_court', thread: 'fall', chapter: 2, title: 'COURT MARTIAL', from: 'MILITARY TRIBUNAL (FIELD)',
      lines: ['Charge: desertion. Private Volkov left his post to walk to the spaceport.', 'Defence: "there are no ships coming".', 'Verdict: guilty. Sentence deferred until a ship arrives to carry it out.', 'He is still in the brig. He is right.'],
    },
  ],
  kombinat: [
    {
      id: 'kb_memo', thread: 'fall', chapter: 3, title: 'ACQUISITION MEMO', from: 'KOMBINAT HOLDINGS · LEGAL',
      lines: ['Station and contents acquired at liquidation auction, lot 7.', 'Research staff to be retained on existing (unpaid) contracts.', 'Security to treat all Commonwealth-era hardware as proprietary.', 'Do not open sealed laboratories. Our insurers were very specific.'],
    },
    {
      id: 'kb_lab12', thread: 'blackout', chapter: 3, title: 'LAB SECTOR 12 · INCIDENT', from: 'DR. A. MIRONOVA',
      lines: ['The egg samples are warmer than the incubator. The incubator is off.', 'Growth resumed at 03:14 station time, the exact second of the old Blackout timestamp.', 'Every sample. Simultaneously.', 'Requesting transfer. Requesting it loudly.'],
    },
    {
      id: 'kb_review', title: 'SECURITY PERFORMANCE REVIEW', from: 'HR SYSTEM',
      lines: ['Guard 0417: "Responds to scavengers with appropriate force."', 'Guard 0418: "Responds to scavengers with inappropriate force. Promote."', 'Guard 0419: "Asks questions about the sealed labs." Terminate.'],
    },
    {
      id: 'kb_vault', thread: 'nine', chapter: 3, title: 'DATA VAULT INDEX', from: 'ORBITA ARCHIVE',
      lines: ['1,204 drives of Commonwealth research, 1,203 catalogued.', 'Drive 1204 has no filesystem. It hums.', 'Moved to the vault pending analysis.'],
    },
  ],
  sirin: [
    {
      id: 'sr_watch', thread: 'nine', chapter: 4, title: 'LISTENING WATCH', from: 'OPERATOR ON DUTY',
      lines: ['Channel nine carrier present. Same as yesterday. Same as every day for eleven years.', 'Today it paused. Like it was waiting for an answer.', 'Nobody answer it.', 'I think somebody answered it.'],
    },
    {
      id: 'sr_contact', thread: 'fall', chapter: 4, title: 'CONTACT LAB', from: 'PROJECT LEAD (CLEARANCE 5)',
      lines: ['The signal is not a language. It is an address.', 'Every Commonwealth node was built to listen for it. We did not build that part.', 'Central knew. Central always knew.', 'At 00:00:00.000 the nodes stopped listening, because they had heard enough.'],
    },
    {
      id: 'sr_garden', thread: 'running', chapter: 4, title: 'THE GARDEN', from: 'BOTANY · AUTOMATED',
      lines: ['GROWTH MEDIUM: STEEL', 'IRRIGATION: NOT REQUIRED', 'LIGHT: NOT REQUIRED', 'CARETAKER: ASSIGNED (NOT COMMONWEALTH PERSONNEL)'],
    },
    {
      id: 'sr_last', thread: 'nine', chapter: 4, title: 'LAST ENTRY', from: 'STATION LOG',
      lines: ['Relay Zero is transmitting on its own.', 'We pulled the power. It is still transmitting.', 'If you are reading this, you landed. Leave something behind and go.', 'It is only fair.'],
    },
  ],
};

/**
 * Handwriting, found with what someone left behind (see the vignettes in facilityGen): the
 * people who were here, and the ones who came before you.
 */
export const NOTES: Record<string, LoreEntry> = {
  meal: {
    id: 'note_meal', thread: 'stayed', chapter: 1, note: true,
    title: 'A NOTE ON THE TRAY', from: 'PENCIL, ON A MEAL CARD',
    lines: ['Back in ten minutes.', 'Do not touch my soup.', '— V.'],
  },
  child: {
    id: 'note_child', thread: 'stayed', chapter: 1, note: true,
    title: 'A CHILD\'S DRAWING', from: 'CRAYON, TAPED INSIDE A LOCKER DOOR',
    lines: ['A rocket, a house, a sun with a face. Four people holding hands.', '"ПАПА, КОГДА ТЫ ПРИЛЕТИШЬ?"', 'Papa, when are you flying home?'],
    react: { crew: 'medic', line: 'You kept the drawing. Good. Give it to me, I\'ll put it up in the medbay. Somebody should look at it now and then.' },
  },
  stand: {
    id: 'note_stand', note: true,
    title: 'WRITTEN ON A STORES DOCKET', from: 'BALLPOINT, SHAKY',
    lines: ['Held the stores three days. Out of rounds.', 'If you are reading this you got in, so I lost.', 'Take the batteries. Leave the photograph.'],
  },
  camp: {
    id: 'note_camp', thread: 'stayed', chapter: 2, note: true,
    title: 'HOUSE RULES', from: 'CHALK, ON A CRATE LID',
    lines: ['1. No light after the second bell.', '2. Nobody goes below.', '3. If the radio talks, turn it off.', '— the Lukins'],
  },
  vesna: {
    id: 'note_vesna', note: true,
    title: 'SCRATCHED INTO A LOCKER', from: 'KNIFE POINT',
    lines: ['Crew of the VESNA. Two in, one out.', 'The pad alarm draws them in.', 'Use the lift if you can find its breaker.'],
    react: { crew: 'smuggler', line: 'The Vesna? I sold them their last map. Two in, one out. That\'s better than most crews manage.' },
  },
  clock: {
    id: 'note_clock', thread: 'blackout', chapter: 1, note: true,
    title: 'TAPED UNDER A STOPPED CLOCK', from: 'MARKER, BLOCK CAPITALS',
    lines: ['DO NOT RESET THE CLOCK.', 'It is not broken.', 'It is the last thing that knew what time it was.'],
  },
};

/** Zarya-7, the first job: the station's own log is waiting on its first terminal. */
export const ZARYA_LOG: LoreEntry = {
  id: 'zarya_log', thread: 'stayed', chapter: 1,
  title: 'SHIFT LOG · ZARYA-7', from: 'STATION MASTER GORBUNOV',
  lines: [
    'Shift 14,601. Pump 2 serviced. Relay silent, as always.',
    'We keep the station running because the station keeps us warm.',
    'Somebody is taking batteries from the store. Not us. We counted.',
    'If the relay ever answers: Zarya-7 never missed a shift.',
  ],
  react: { crew: 'trader', line: 'Zarya-7 never missed a shift. Hm. Forty years. I\'ve never kept anything going that long, except this ship.' },
};

export const ALL_LORE: LoreEntry[] = [
  ...SHARED, ...Object.values(THEMED).flat(), ...Object.values(NOTES), ZARYA_LOG,
];
export const LORE_BY_ID: Record<string, LoreEntry> = Object.fromEntries(ALL_LORE.map((e) => [e.id, e]));

/** Every entry a facility on this destination can show, themed ones first. */
export function lorePool(destination: string): LoreEntry[] {
  return [...(THEMED[destination] ?? THEMED.tikhaya), ...SHARED];
}

/**
 * The entry for terminal number `n` of a raid: different terminals, different entries.
 * With what the operator has already read, unread entries come first, earliest chapter of
 * each thread first, so the threads unfold in order across raids.
 */
export function loreEntry(destination: string, seed: number, n: number, read: readonly string[] = []): LoreEntry {
  const pool = lorePool(destination);
  // A seeded rotation keeps entries distinct within a raid and varied across raids.
  const offset = (seed * 2654435761) >>> 0;
  const rotated = pool.map((_, i) => pool[(offset + i) % pool.length]);
  return ordered(rotated, new Set(read))[n % rotated.length];
}

/** Unread before read; within each, a thread's early chapters before its later ones. */
function ordered(entries: LoreEntry[], read: Set<string>): LoreEntry[] {
  // How far into each thread the operator already is.
  const depth: Partial<Record<Thread, number>> = {};
  for (const id of read) {
    const e = LORE_BY_ID[id];
    if (e?.thread) depth[e.thread] = Math.max(depth[e.thread] ?? 0, e.chapter ?? 1);
  }
  // An entry is "ready" if its chapter is at most one past what they've seen of its thread.
  const ready = (e: LoreEntry) => !e.thread || (e.chapter ?? 1) <= (depth[e.thread] ?? 0) + 1;
  const rank = (e: LoreEntry) => (read.has(e.id) ? 2 : ready(e) ? 0 : 1);
  return entries.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i).map((x) => x.e);
}
