'use strict';

const boom = require('boom');
const joi = require('joi');

module.exports = () => ({
    method: 'GET',
    path: '/jobs/{id}/metrics/steps',
    config: {
        description: 'Get step metrics for this job',
        notes: 'Returns list of step metrics for the given job',
        tags: ['api', 'jobs', 'metrics'],
        auth: {
            strategies: ['token'],
            scope: ['user', '!guest', 'job']
        },
        plugins: {
            'hapi-swagger': {
                security: [{ token: [] }]
            }
        },
        handler: (request, reply) => {
            const factory = request.server.app.jobFactory;
            const { id } = request.params;
            const { startTime, endTime, stepName } = request.query;

            return factory.get(id)
                .then((job) => {
                    if (!job) {
                        throw boom.notFound('Job does not exist');
                    }

                    return job.getStepMetrics({
                        startTime,
                        endTime,
                        stepName
                    });
                })
                .then(metrics => reply(metrics))
                .catch(err => reply(boom.boomify(err)));
        },
        validate: {
            query: joi.object({
                startTime: joi.string().isoDate(),
                endTime: joi.string().isoDate(),
                stepName: joi.string() // optional, if not passed in will fetch all steps
            })
        }
    }
});
