import { Worker } from '@temporalio/worker';

async function run() {
  const worker = await Worker.create({
    activities: {}, 
    taskQueue: 'default',
  });

  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
