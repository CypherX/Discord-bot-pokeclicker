const { EmbedBuilder } = require('discord.js');
const { addAmount, addReminder } = require('../database.js');
const { bonusRoles, serverIcons, autoReminderRoleID } = require('../config.js');
const {
  getLastClaim,
  updateClaimDate,
  bumpClaimStreak,
  resetClaimStreak,
  warn,
  SECOND,
  MINUTE,
  HOUR,
  DAY,
  TIME_BETWEEN_TIMELY_CLAIMS,
  TIME_TO_RESET_TIMELY_STREAK,
  PAUSED_TIME_TO_RESET_STREAK,
} = require('../helpers.js');

const timelyAmount = 10;

const calcStreakBonus = (streak) => {
  const bigStreak = Math.max(0, Math.min(10, streak));
  streak -= bigStreak;
  const midStreak = Math.max(0, Math.min(50, streak));
  streak -= midStreak;
  return bigStreak + Math.floor(midStreak * 0.2) + Math.floor(streak * 0.05);
};

const s = (amt) => amt != 1 ? 's' : '';

module.exports = {
  name        : 'timely',
  aliases     : [],
  description : 'Claim your 2 hourly PokéCoins',
  args        : [],
  guildOnly   : true,
  cooldown    : 3,
  botperms    : ['SendMessages', 'EmbedLinks'],
  userperms   : ['SendMessages'],
  channels    : ['game-corner', 'bot-commands'],
  execute     : async (msg, args) => {
    // Check if user claimed within the last 24 hours
    let { last_claim, streak, paused } = await getLastClaim(msg.author, 'timely_claim');

    if (last_claim > Date.now()) {
      last_claim = Date.now() - (TIME_BETWEEN_TIMELY_CLAIMS + 1000);
    }

    // User already claimed within last 2 hours
    if (last_claim >= (Date.now() - TIME_BETWEEN_TIMELY_CLAIMS)) {
      const time_left = (+last_claim + TIME_BETWEEN_TIMELY_CLAIMS) - Date.now();
      const hours = Math.floor(time_left % DAY / HOUR);
      const minutes = Math.floor(time_left % HOUR / MINUTE);
      const seconds = Math.floor(time_left % MINUTE / SECOND);
      let timeRemaining = '';
      if (+hours) timeRemaining += `${hours} hour${s(hours)} `;
      if (+hours || +minutes) timeRemaining += `${minutes} minute${s(minutes)} `;
      timeRemaining += `${seconds} second${s(seconds)}`;
      return msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#e74c3c')
            .setFooter({ text: 'Next timely' })
            .setTimestamp(TIME_BETWEEN_TIMELY_CLAIMS + (+last_claim))
            .setDescription(`${msg.author}\nYou've already claimed your ${serverIcons.money} too recently\nYou can claim again in ${timeRemaining}`),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    // Should the claim streak be reset (if more than 14 days, or 61 days if paused)
    if (last_claim < (Date.now() - (paused ? PAUSED_TIME_TO_RESET_STREAK : TIME_TO_RESET_TIMELY_STREAK))) {
      await resetClaimStreak(msg.author, 'timely_claim');
      streak = 0;
    }

    // Calculate bonuses
    const streakBonus = calcStreakBonus(streak);
    let totalAmount = timelyAmount + streakBonus;
    const roleBonuses = [];
    try {
      msg.member.roles.cache.map(r => r.id).forEach(roleID => {
        const bonus = bonusRoles[roleID];
        if (bonus) {
          roleBonuses.push([roleID, Math.floor(totalAmount * bonus)]);
        }
      });
    } catch (e) {
      warn('something went wrong calculating role claim bonuses', e);
    }
    totalAmount += roleBonuses.reduce((a, [r, b]) => a + b, 0);

    // Add the coins to the users balance then set last claim time (incase the user doesn't exist yet)
    const balance = await addAmount(msg.author, totalAmount, 'coins');
    await updateClaimDate(msg.author, 'timely_claim');
    await bumpClaimStreak(msg.author, 'timely_claim');

    const message = [`Timely Claim: **+${timelyAmount.toLocaleString('en-US')}** ${serverIcons.money}`];

    if (streakBonus) {
      message.push(`Streak Bonus: **+${streakBonus.toLocaleString('en-US')}** ${serverIcons.money} `);
    }

    roleBonuses.forEach(([r, b]) => {
      message.push(`<@&${r}>: **+${b.toLocaleString('en-US')}** ${serverIcons.money}`);
    });

    message.push(
      `Total Coins: **+${totalAmount.toLocaleString('en-US')} ${serverIcons.money}**`,
      '',
      `Current Balance: **${balance.toLocaleString('en-US')}** ${serverIcons.money}`,
      `Current Streak: **${streak + 1}**`
    );
    
    let footer = '';
    if (msg.member.roles.cache.has(autoReminderRoleID)) {
      const reminderTime = new Date(Date.now() + TIME_BETWEEN_TIMELY_CLAIMS);

      addReminder(msg.author, reminderTime, '/timely\nhttps://discord.com/channels/450412847017754644/1204292652871450696/1204293235472867338');

      footer = 'Auto reminder will be sent in 2 hours';
    } else {
      footer = 'You can use the /roles command to be automatically reminded';
    }

    return msg.reply({
      embeds: [new EmbedBuilder().setColor('#2ecc71').setDescription(message.join('\n')).setFooter({ text: footer })],
      allowedMentions: { repliedUser: false },
    });
  },
};
