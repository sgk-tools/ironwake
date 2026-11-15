import { HERO_ACTIONS } from './anim.js';

const NAMES = {
  L1: '右からの横斬り', L2: '左からの横斬り', L1B: '右からの斬り上げ', L2B: '左からの斬り上げ',
  L3: '兜割り', L4: '重い横回転斬り', L5: '連続突き', L6: 'ジャンプ斬り',
  AIR_SLASH: '打ち上げからの空中追撃', BACK_LEAP: '後ろジャンプ斬り', BACKCUT: '後退斬り',
  CROSS: '右上からの袈裟斬り', CROSS2: '左上からの袈裟斬り', DASH: '踏み込み突き',
  DOWNCUT: '真上からの斬り下ろし', DRAG: '地擦り斬り上げ', FIN2: '衝撃波の叩きつけ',
  HIGHCUT: '右からの高い横斬り', HIGHCUT2: '左からの高い横斬り',
  JUMP_FLIP: '前ジャンプ縦回転斬り', JUMP_SPIN: '前ジャンプ横回転斬り',
  LOWSWEEP: '右からの足払い斬り', LOWSWEEP2: '左からの足払い斬り', RETREAT_SWEEP: '跳び退き薙ぎ払い',
  REVSPIN: '逆横回転斬り', RFLIP: '覚醒縦回転斬り', RISECUT: '逆袈裟の斬り上げ', RLEAP: '大跳躍斬り',
  RSPIN2: '二段横回転斬り', SHOULDER: '肩打ち', SPIN1: '横回転斬り', STAB: '片手突き',
  STEP_CUT: '踏み込み横斬り', UPPER: '打ち上げ斬り', VAULT: '剣を支点に跳ぶ斬り', VCUT: 'V字斬り',
  WHEEL: '小跳び縦回転斬り', XCUT: '十字斬り', XCUT_REV: '逆十字斬り',
};

export function slashName(move) {
  if (move.includes('+')) return move.split('+').map(slashName).join(' → ');
  const [name, variant] = move.split('~');
  const suffix = variant === 'F' ? '（速）' : variant === 'H' ? '（重）' : '';
  return (NAMES[name] || name) + suffix;
}

export const SLASH_DIRECTIONS = {
  FWD: '↑ 前', L45: '↖ 左前', R45: '↗ 右前', L90: '← 左', R90: '→ 右',
  L135: '↙ 左後ろ', R135: '↘ 右後ろ', BACK: '↓ 後ろ',
};
export const SLASH_GROUPS = ['単発', '連撃', '重で締める', '回避から', '覚醒中'];

// Search the real move selectors. Keep the shortest command sequence for each reachable move.
export function buildSlashLessons({ pickLight, pickFinisher, dodgeCutFor, idleCounter, maxCombo }) {
  const lessons = new Map();
  const directions = [null, ...Object.keys(SLASH_DIRECTIONS)];
  const remember = (commands, awaken, technique, group) => {
    const { move } = commands.at(-1);
    const known = lessons.get(move);
    const cost = commands.length + Number(awaken) + Number(group === '回避から');
    if (known && known.cost <= cost) return;
    lessons.set(move, { move, commands, awaken, technique, group, cost, name: slashName(move) });
  };
  const choices = evaluate => {
    let pool;
    const chosen = evaluate((options, prev) => {
      const filtered = options.filter(move => move !== prev);
      pool = filtered.length ? filtered : options;
      return pool[0];
    });
    return pool || [chosen];
  };

  for (const dir of directions) {
    remember([{ kind: 'counter', dir, move: idleCounter(dir) }], false, 10, '回避から');
  }
  for (const [technique, awaken] of [[10, false], [10, true], [1, false], [4, false], [1, true], [4, true]]) {
    const actor = { stats: { technique }, level: technique, rageT: Number(awaken), comboIdx: 0, lightCount: 0, neutralChain: 0, act: null };
    let frontier = [{ actor, commands: [] }];
    for (let count = 0; count <= maxCombo(technique); count++) {
      const next = new Map();
      for (const node of frontier) {
        const prev = node.actor.act;
        for (const dir of directions) {
          if (prev) {
            for (const move of choices(choose => pickFinisher(count, dir || prev.cutDir, prev, choose))) {
              remember([...node.commands, { kind: 'heavy', dir, move }], awaken, technique, awaken ? '覚醒中' : '重で締める');
            }
            const move = dodgeCutFor(count, dir);
            remember([...node.commands, { kind: 'counter', dir, move }], awaken, technique, awaken ? '覚醒中' : '回避から');
          }
          if (count === maxCombo(technique)) continue;
          const state = { ...node.actor };
          const moves = choices(choose => pickLight(prev?.name, dir, state, choose));
          const cutStep = prev && prev.cutDir === dir ? (prev.cutStep || 0) + 1 : prev && dir ? 1 : 0;
          for (const move of moves) {
            const commands = [...node.commands, { kind: 'light', dir, move }];
            remember(commands, awaken, technique, awaken ? '覚醒中' : count ? '連撃' : '単発');
            const key = [move, dir, cutStep, state.comboIdx, state.neutralChain].join('/');
            if (!next.has(key)) next.set(key, { commands, actor: { ...state, act: { name: move, def: HERO_ACTIONS[move], cutDir: dir, cutStep } } });
          }
        }
      }
      frontier = next.values();
    }
  }
  return [...lessons.values()].sort((a, b) => SLASH_GROUPS.indexOf(a.group) - SLASH_GROUPS.indexOf(b.group) || a.cost - b.cost || a.name.localeCompare(b.name, 'ja'));
}
