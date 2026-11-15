export const SLASH_DIRECTIONS = {
  FWD: { stick: '↑ 上', keys: '↑' },
  R45: { stick: '↗ 右上', keys: '↑＋→' },
  L90: { stick: '← 左', keys: '←' },
  BACK: { stick: '↓ 下', keys: '↓' },
};

const light = (dir, move) => ({ kind: 'light', dir, move });

export const SLASH_LESSONS = [
  { name: '右上への斬り込み', commands: [light('R45', 'HIGHCUT2')] },
  { name: '地上の横回転斬り', commands: [light('L90', 'CROSS'), light('L90', 'SPIN1')] },
  { name: '前ジャンプ縦回転斬り', commands: [light('FWD', 'DASH'), light('FWD', 'JUMP_FLIP')] },
  { name: '前ジャンプ横回転斬り', commands: [light('R45', 'HIGHCUT2'), light('R45', 'JUMP_SPIN')] },
  { name: '後ろジャンプ斬り', commands: [light('BACK', 'UPPER'), light('BACK', 'DOWNCUT'), light('BACK', 'BACK_LEAP')] },
  { name: '打ち上げからの空中追撃', commands: [light('BACK', 'UPPER'), light(null, 'AIR_SLASH')] },
  { name: '衝撃波の叩きつけ', commands: [light('FWD', 'DASH'), { kind: 'heavy', dir: 'BACK', move: 'FIN2' }] },
].map(lesson => ({ ...lesson, move: lesson.commands.at(-1).move }));
