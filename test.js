var http = require('http');
const { CronJob } = require('cron');

http.createServer(function (req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
  
}).listen(process.env.PORT || 3000);

const job = new CronJob(`*/5 * * * * *`, () => {
  console.log(new Date());
});

job.start();