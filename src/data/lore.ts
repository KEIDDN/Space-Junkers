/**
 * What's left on facility terminals: shift logs, orders, personal notes. Each theme has
 * its own pool plus a shared one; a raid never shows the same entry twice.
 */

export interface LoreEntry {
  title: string;
  /** Header line: who wrote it, when. */
  from: string;
  lines: string[];
}

const SHARED: LoreEntry[] = [
  {
    title: 'NETWORK STATUS', from: 'AUTOMATED · NODE HEALTH',
    lines: ['UPLINK TO CENTRAL: NO CARRIER', 'LAST HANDSHAKE: 00:00:00.000 (SEE BLACKOUT PROTOCOL)', 'RETRYING. RETRYING. RETRYING.', 'Retry count exceeds display width.'],
  },
  {
    title: 'CIVIL DEFENCE NOTICE', from: 'COMMONWEALTH MINISTRY OF ORDER',
    lines: ['Citizens are reminded that the interruption of central broadcasts is temporary.', 'Remain at your post. Continue production quotas.', 'Rumours of the dissolution of the Commonwealth are enemy propaganda.', 'This notice will repeat.'],
  },
  {
    title: 'PAYROLL', from: 'ACCOUNTS · AUTOMATED',
    lines: ['SALARY TRANSFER FAILED: CENTRAL BANK UNREACHABLE', 'SALARY TRANSFER FAILED: CENTRAL BANK UNREACHABLE', 'SALARY TRANSFER FAILED: CENTRAL BANK UNREACHABLE', 'Personal note appended: "then who are we working for"'],
  },
  {
    title: 'MESSAGE (UNSENT)', from: 'PERSONAL · DRAFTS',
    lines: ['Lena, the shuttles stopped. They say one more month.', 'I kept your letter in my locker. If someone finds this, the locker code is her birthday.', 'Tell her I stayed because I was told to.'],
  },
  {
    title: 'SECURITY BULLETIN', from: 'SITE SECURITY',
    lines: ['Scavenger activity reported in adjacent sectors.', 'They move in the dark and listen for footsteps. So should you.', 'Do not use hand lamps in corridors after the second bell.'],
  },
  {
    title: 'BLACKOUT PROTOCOL', from: 'RESTRICTED · CLEARANCE 4',
    lines: ['In the event of total loss of the central network:', '1. Seal vaults. 2. Continue the listening watch.', '3. Do not reply to any transmission on the ninth channel.', 'Whatever it says.'],
  },
];

const THEMED: Record<string, LoreEntry[]> = {
  tikhaya: [
    {
      title: 'SHIFT LOG · LINE 3', from: 'FOREMAN ZHUKOV',
      lines: ['Day 212 without a supply ship. Line 3 still running.', 'Nobody ordered us to stop, so we make tractors for fields no one will plant.', 'I have forty tractors in the yard. I have no diesel. I have no farmers.', 'Tomorrow we make forty-one.'],
    },
    {
      title: 'MAINTENANCE TICKET #4471', from: 'WORKSHOP B',
      lines: ['Press 6 hydraulic seal leaking again.', 'Replacement part requisitioned from Central: NO RESPONSE (x19).', 'Fixed it with a boot. Works fine. Do not tell the inspector.', 'Inspector has not visited in two years.'],
    },
    {
      title: 'CANTEEN MENU', from: 'CANTEEN 2',
      lines: ['MONDAY: CABBAGE SOUP', 'TUESDAY: CABBAGE SOUP (THICK)', 'WEDNESDAY: RUMOUR OF MEAT', 'THURSDAY: CABBAGE SOUP. The greenhouse on level 2 is ours now. Guard it.'],
    },
    {
      title: 'STAFF NOTICE', from: 'PLANT DIRECTOR',
      lines: ['Theft of copper wiring from the lighting circuits must stop.', 'Every metre you take is a corridor someone walks in the dark.', 'The scavengers are not the only ones stealing.'],
    },
  ],
  merzlota: [
    {
      title: 'HEATING SYSTEM', from: 'AUTOMATED · CRYO PLANT',
      lines: ['PRIMARY BOILER: OFFLINE', 'SECONDARY BOILER: OFFLINE', 'EMERGENCY HEAT: RESERVED FOR SHAFT 9 PUMPS', 'Crew quarters temperature: -31. Advise crew to sleep in the pump hall.'],
    },
    {
      title: 'SHAFT 9 REPORT', from: 'MINE FOREMAN KAMENEV',
      lines: ['Drill head broke into a cavity at 1,140 metres. Warm air. Warm.', 'The crystals there grow in rings, like a tree. Some rings are newer than the mine.', 'Sealing the cavity until the geologists arrive.', 'The geologists are not coming. Nobody is.'],
    },
    {
      title: 'SEALING ORDER', from: 'SITE COUNCIL',
      lines: ['By vote of 41 to 3 the lower levels are sealed.', 'We have heat for one ring of corridors, not two.', 'The three who voted against have gone below. May the ice be kind.'],
    },
    {
      title: 'PERSONAL LOG', from: 'MINER (NAME SCRATCHED OUT)',
      lines: ['Found a raider camp on the ice road. Fires still warm. No one there.', 'They leave the fires burning so you think they are close.', 'They are close.'],
    },
  ],
  krasnaya: [
    {
      title: 'STANDING ORDERS', from: 'GARRISON COMMAND · DEPOT 4',
      lines: ['Hold the depot until relieved.', 'Do not surrender Commonwealth materiel to unauthorised persons.', 'All persons are unauthorised.', 'Orders valid until countermanded. Orders have not been countermanded.'],
    },
    {
      title: 'DUTY ROSTER', from: 'SERGEANT MAJOR ILYIN',
      lines: ['Watch 1: Petrov, Sayed, Orlov', 'Watch 2: Adeyemi (the Hammer), Kuznetsova, Brandt', 'Watch 3: vacant, vacant, vacant', 'Replacements requested 14 times. Stop requesting.'],
    },
    {
      title: 'ARMOURY INVENTORY', from: 'QUARTERMASTER',
      lines: ['AKR-74: 212 (serviceable 190)', '5.45 BALL: 60,000 rounds. 5.45 AP: sealed in the vault, keycard with the commander.', 'Commander deceased. Keycard location unknown.', 'Do not blow the vault door. We tried. It is a very good door.'],
    },
    {
      title: 'COURT MARTIAL', from: 'MILITARY TRIBUNAL (FIELD)',
      lines: ['Charge: desertion. Private Volkov left his post to walk to the spaceport.', 'Defence: "there are no ships coming".', 'Verdict: guilty. Sentence deferred until a ship arrives to carry it out.', 'He is still in the brig. He is right.'],
    },
  ],
  kombinat: [
    {
      title: 'ACQUISITION MEMO', from: 'KOMBINAT HOLDINGS · LEGAL',
      lines: ['Station and contents acquired at liquidation auction, lot 7.', 'Research staff to be retained on existing (unpaid) contracts.', 'Security to treat all Commonwealth-era hardware as proprietary.', 'Do not open sealed laboratories. Our insurers were very specific.'],
    },
    {
      title: 'LAB SECTOR 12 · INCIDENT', from: 'DR. A. MIRONOVA',
      lines: ['The egg samples are warmer than the incubator. The incubator is off.', 'Growth resumed at 03:14 station time, the exact second of the old Blackout timestamp.', 'Every sample. Simultaneously.', 'Requesting transfer. Requesting it loudly.'],
    },
    {
      title: 'SECURITY PERFORMANCE REVIEW', from: 'HR SYSTEM',
      lines: ['Guard 0417: "Responds to scavengers with appropriate force."', 'Guard 0418: "Responds to scavengers with inappropriate force. Promote."', 'Guard 0419: "Asks questions about the sealed labs." Terminate.'],
    },
    {
      title: 'DATA VAULT INDEX', from: 'ORBITA ARCHIVE',
      lines: ['1,204 drives of Commonwealth research, 1,203 catalogued.', 'Drive 1204 has no filesystem. It hums.', 'Moved to the vault pending analysis.'],
    },
  ],
  sirin: [
    {
      title: 'LISTENING WATCH', from: 'OPERATOR ON DUTY',
      lines: ['Channel nine carrier present. Same as yesterday. Same as every day for eleven years.', 'Today it paused. Like it was waiting for an answer.', 'Nobody answer it.', 'I think somebody answered it.'],
    },
    {
      title: 'CONTACT LAB', from: 'PROJECT LEAD (CLEARANCE 5)',
      lines: ['The signal is not a language. It is an address.', 'Every Commonwealth node was built to listen for it. We did not build that part.', 'Central knew. Central always knew.', 'At 00:00:00.000 the nodes stopped listening, because they had heard enough.'],
    },
    {
      title: 'THE GARDEN', from: 'BOTANY · AUTOMATED',
      lines: ['GROWTH MEDIUM: STEEL', 'IRRIGATION: NOT REQUIRED', 'LIGHT: NOT REQUIRED', 'CARETAKER: ASSIGNED (NOT COMMONWEALTH PERSONNEL)'],
    },
    {
      title: 'LAST ENTRY', from: 'STATION LOG',
      lines: ['Relay Zero is transmitting on its own.', 'We pulled the power. It is still transmitting.', 'If you are reading this, you landed. Leave something behind and go.', 'It is only fair.'],
    },
  ],
};

/** Every entry a facility on this destination can show, themed ones first. */
export function lorePool(destination: string): LoreEntry[] {
  return [...(THEMED[destination] ?? THEMED.tikhaya), ...SHARED];
}

/** The entry for terminal number `n` of a raid: different terminals, different entries. */
export function loreEntry(destination: string, seed: number, n: number): LoreEntry {
  const pool = lorePool(destination);
  // A seeded rotation keeps entries distinct within a raid and varied across raids.
  const offset = (seed * 2654435761) >>> 0;
  return pool[(offset + n) % pool.length];
}
