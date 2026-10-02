// マイページ・戦績の詳細の ?sample で使う、ログイン中のサンプルの戦績（保存はしない）
const SAMPLE_ACCOUNT = { provider: "Google", name: "ねこぜ" };
const SAMPLE_HISTORY = (() => {
  const day = 864e5;
  const me = (name = "ねこぜ") => ({ name, isMe: true });
  const row = (who, rank, total, art) => ({ ...(typeof who === "string" ? { name: who, isMe: false } : who), rank, total, art });
  return [
    {
      key: "s1", at: Date.now() - 0.1 * day, code: "K7QX2MPA", level: "ふつう", players: 4,
      rank: 1, total: 128.4, sim: 91.2, speed: 16, bonus: 9, gens: 3, art: "pink.twin.blue.sailor.smile.sky",
      cats: { char: 94.1, tag: 88.6, content: 90.3, pose: 89.8 },
      ranking: [row(me(), 1, 128.4, "pink.twin.blue.sailor.smile.sky"), row("ぴよ丸", 2, 101.7, "pink.bob.blue.sailor.smile.sky"), row("ぴくせる侍", 3, 90.6, "blonde.twin.red.hoodie.wink.white"), row("プロンプト職人", null, null, null)],
    },
    {
      key: "s2", at: Date.now() - 0.3 * day, code: "K7QX2MPA", level: "ふつう", players: 4,
      rank: 3, total: 88.0, sim: 70.4, speed: 11, bonus: 6, gens: 4, art: "blonde.long.red.hoodie.wink.white",
      cats: { char: 66.2, tag: 74.9, content: 71.8, pose: 68.0 },
      ranking: [row("ぴよ丸", 1, 112.3, "pink.twin.blue.sailor.calm.sky"), row("プロンプト職人", 2, 95.1, "pink.bob.green.sailor.smile.white"), row(me(), 3, 88.0, "blonde.long.red.hoodie.wink.white"), row("ぴくせる侍", 4, 61.2, "black.bob.green.dress.calm.room")],
    },
    {
      key: "s3", at: Date.now() - 1.2 * day, code: "3TA9AXBK", level: "かんたん", players: 2,
      rank: 1, total: 112.6, sim: 86.1, speed: 14, bonus: 12, gens: 2, art: "pink.bob.blue.sailor.smile.white",
      cats: { char: 89.0, tag: 83.4, content: 87.2, pose: 84.9 },
      ranking: [row(me(), 1, 112.6, "pink.bob.blue.sailor.smile.white"), row("ぴよ丸", 2, 97.5, "pink.twin.red.sailor.smile.white")],
    },
    {
      key: "s4", at: Date.now() - 3 * day, code: "R8VA8J4G", level: "むずかしい", players: 3,
      rank: 2, total: 79.3, sim: 64.8, speed: 8, bonus: 6, gens: 4, art: "silver.long.green.dress.calm.room",
      cats: { char: 58.3, tag: 70.2, content: 66.1, pose: 63.9 },
      ranking: [row("ぴくせる侍", 1, 84.0, "blonde.long.blue.dress.smile.room"), row(me(), 2, 79.3, "silver.long.green.dress.calm.room"), row("ぴよ丸", 3, 70.8, "blue.twin.green.hoodie.wink.room")],
    },
    {
      key: "s5", at: Date.now() - 6 * day, code: "C4TEJMM5", level: "かんたん", players: 2,
      rank: null, total: null, sim: null, speed: null, bonus: null, gens: 5, art: null, cats: null,
      ranking: [row("ぴよ丸", 1, 93.4, "pink.twin.blue.hoodie.smile.white"), row(me(), null, null, null)],
    },
  ];
})();
