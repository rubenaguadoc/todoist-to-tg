const { TodoistApi } = require('@doist/todoist-api-typescript');
const { Telegraf } = require('telegraf');
const moment = require('moment');

let db;
Promise.all([import('lowdb'), import('lowdb/node')]).then(
  ([{ LowSync }, { JSONFileSync }]) => {
    db = new LowSync(new JSONFileSync('db.json'), { tasks: [] });
  }
);
const api = new TodoistApi(process.env.API_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.launch();

async function sendPendingTasks() {
  const pendingTasks = await api.getTasks({
    projectId: process.env.PROJECT_ID,
  });
  db.read();
  const prevTasks = db.data.tasks;

  for (const { id, ...task } of pendingTasks) {
    const msg = `Tarea creada el ${moment(task.createdAt).format(
      'DD/MM/YY \\a \\l\\a\\s HH:mm'
    )}:${
      task.due?.date
        ? `\n\nVencimiento: ${moment(task.due.date).format('DD/MM/YY')}`
        : ''
    }\n\n*${task.content}*${
      task.description ? `\n\n${task.description}` : ''
    }\n\n${task.url ? `[Ir a la tarea](${task.url})` : ''}`;

    const prevMsgI = prevTasks.findIndex((t) => t.id === id);
    if (prevMsgI !== -1) {
      await bot.telegram
        .deleteMessage(process.env.TG_CHAT_ID, prevTasks[prevMsgI].messageId)
        .catch(() => {});
      prevTasks.splice(prevMsgI, 1);
    }

    const { message_id: messageId } = await bot.telegram.sendMessage(
      process.env.TG_CHAT_ID,
      msg,
      {
        parse_mode: 'Markdown',
        disable_notification: moment().minute() > 11,
        link_preview_options: { is_disabled: true },
      }
    );

    prevTasks.push({ id, messageId });
    db.write();
  }

  for (const task of prevTasks) {
    const taskPending = pendingTasks.some((t) => t.id === task.id);
    if (!taskPending)
      await bot.telegram
        .deleteMessage(process.env.TG_CHAT_ID, task.messageId)
        .catch(() => {});
  }

  db.data.tasks = prevTasks.filter((t) =>
    pendingTasks.some((pt) => pt.id === t.id)
  );
  db.write();
}

setInterval(sendPendingTasks, 10 * 60 * 1000);
setTimeout(sendPendingTasks, 5 * 1000);
