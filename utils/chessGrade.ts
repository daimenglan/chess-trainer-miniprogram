/**
 * 棋协等级体系常量（与网页版 shared/types/index.ts 的 CHESS_GRADE_* 保持一致）
 *
 * 训练中心的「升级目标」卡片需要展示等级中文名与 Elo 区间，并让用户在下拉框里
 * 选择当前/目标等级。这里只保留展示与选择所必需的三张表，取值必须与后端校验
 * （profileRoutes.ts 的 CHESS_GRADE_ORDER）逐字一致，否则保存时会被判为无效等级。
 */

/** 等级中文名映射 */
export const CHESS_GRADE_LABELS: Record<string, string> = {
  'level-10': '棋协10级棋士',
  'level-9': '棋协9级棋士',
  'level-8': '棋协8级棋士',
  'level-7': '棋协7级棋士',
  'level-6': '棋协6级棋士',
  'level-5': '棋协5级棋士',
  'level-4': '棋协4级棋士',
  'level-3': '棋协3级棋士',
  'level-2': '棋协2级棋士',
  'level-1': '棋协一级棋士',
  'candidate-master': '候补棋协大师',
  'master': '棋协大师',
  'national-level-2': '国家二级运动员',
  'national-level-1': '国家一级运动员',
  'sports-master': '运动健将',
  'cm': 'CM 候补大师',
  'fm': 'FM 棋联大师',
  'im': 'IM 国际大师',
  'gm': 'GM 特级大师',
};

/** 等级对应 Elo 区间 */
export const CHESS_GRADE_ELO: Record<string, [number, number]> = {
  'level-10': [500, 649],
  'level-9': [650, 799],
  'level-8': [800, 899],
  'level-7': [900, 999],
  'level-6': [1000, 1199],
  'level-5': [1200, 1299],
  'level-4': [1300, 1399],
  'level-3': [1400, 1549],
  'level-2': [1550, 1599],
  'level-1': [1600, 1749],
  'candidate-master': [1750, 1849],
  'master': [1850, 2000],
  'national-level-2': [2001, 2099],
  'national-level-1': [2100, 2199],
  'sports-master': [2200, 2250],
  'cm': [2251, 2299],
  'fm': [2300, 2399],
  'im': [2400, 2499],
  'gm': [2500, 2599],
};

/** 等级排序（索引越大等级越高） */
export const CHESS_GRADE_ORDER: string[] = [
  'level-10', 'level-9', 'level-8', 'level-7', 'level-6',
  'level-5', 'level-4', 'level-3', 'level-2', 'level-1',
  'candidate-master', 'master',
  'national-level-2', 'national-level-1', 'sports-master',
  'cm', 'fm', 'im', 'gm',
];

/** 等级选择器的展示文案，如「棋协6级棋士（Elo 1000-1199）」 */
export function gradeLabel(grade: string): string {
  const label = CHESS_GRADE_LABELS[grade] || grade;
  const elo = CHESS_GRADE_ELO[grade];
  return elo ? `${label}（Elo ${elo[0]}-${elo[1]}）` : label;
}

/** 等级下拉选项（供 picker 使用） */
export function gradeOptions(grades: string[]): string[] {
  return grades.map(gradeLabel);
}
