import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import cron from 'node-cron'
import { JobRepository } from '../../../adapters/repositories/job.repository'
import { runExpiryCheck } from '../../scheduler/job-expiry.scheduler'

async function plugin(app: FastifyInstance): Promise<void> {
  const repo = new JobRepository()

  // node-cron v4: schedule returns a ScheduledTask; { scheduled: false } suppresses auto-start
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task = cron.schedule('* * * * *', async () => {
    try {
      const count = await runExpiryCheck(repo)
      if (count > 0) {
        app.log.info({ deactivated: count }, 'Job expiry check: deactivated expired jobs')
      }
    } catch (err) {
      app.log.error({ err }, 'Job expiry check failed')
    }
  })

  task.start()

  app.addHook('onClose', async () => {
    task.stop()
  })
}

export const schedulerPlugin = fp(plugin)
