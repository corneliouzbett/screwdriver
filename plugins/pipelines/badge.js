'use strict';

const joi = require('joi');
const schema = require('screwdriver-data-schema');
const workflowParser = require('screwdriver-workflow-parser');
const tinytim = require('tinytim');
const idSchema = joi.reach(schema.models.pipeline.base, 'id');

/**
 * Generate Badge URL
 * @method getUrl
 * @param  {string}  badgeService    Template URL for badges - needs {{status}} and {{color}}
 * @param  {Array}  [buildsStatus]   Current status of all builds in the same event
 * @return {string}                  URL to redirect to
 */
function getUrl(badgeService, buildsStatus = []) {
    const counts = {};
    const parts = [];
    let worst = 'lightgrey';

    const statusColor = {
        success: 'green',
        queued: 'blue',
        running: 'blue',
        unknown: 'lightgrey',
        failure: 'red',
        aborted: 'red'
    };

    const levels = [
        'success',
        'queued',
        'running',
        'unknown',
        'failure',
        'aborted'
    ];

    buildsStatus.forEach((status) => {
        counts[status] = (counts[status] || 0) + 1;
    });

    levels.forEach((status) => {
        if (counts[status]) {
            parts.push(`${counts[status]} ${status}`);
            worst = statusColor[status];
        }
    });

    return tinytim.tim(badgeService, {
        status: parts.join(', '), color: worst
    });
}

/**
 * DFS the workflowGraph from the start point
 * @method dfs
 * @param  {Object} workflowGraph   workflowGraph
 * @param  {String} start           Start job name
 * @param  {String} prNum           PR number in case of PR trigger
 * @return {Set}                    A set of build ids that are visited
 */
function dfs(workflowGraph, start, prNum) {
    let nextJobsConfig;

    if (start === '~pr') {
        nextJobsConfig = {
            trigger: start,
            prNum
        };
    } else {
        nextJobsConfig = {
            trigger: start
        };
    }

    const nextJobs = workflowParser.getNextJobs(workflowGraph, nextJobsConfig);

    let visited = new Set(nextJobs);

    nextJobs.forEach((job) => {
        const subJobs = dfs(workflowGraph, job);

        visited = new Set([...visited, ...subJobs]);
    });

    return visited;
}

module.exports = () => ({
    method: 'GET',
    path: '/pipelines/{id}/badge',
    config: {
        description: 'Get a badge for the pipeline',
        notes: 'Redirects to the badge service',
        tags: ['api', 'pipelines', 'badge'],
        handler: (request, reply) => {
            const factory = request.server.app.pipelineFactory;
            const badgeService = request.server.app.ecosystem.badges;

            return factory.get(request.params.id)
                .then((pipeline) => {
                    if (!pipeline) {
                        return reply.redirect(getUrl(badgeService));
                    }

                    return pipeline.getEvents({ sort: 'ascending' }).then((events) => {
                        const lastEvent = events.pop();

                        if (!lastEvent) {
                            return reply.redirect(getUrl(badgeService));
                        }

                        return lastEvent.getBuilds().then((builds) => {
                            if (!builds || builds.length < 1) {
                                return reply.redirect(getUrl(badgeService));
                            }

                            const buildsStatus = builds.reverse()
                                .map(build => build.status.toLowerCase());

                            let workflowLength = 0;

                            if (lastEvent.workflowGraph) {
                                const nextJobs = dfs(lastEvent.workflowGraph,
                                    lastEvent.startFrom,
                                    lastEvent.prNum,
                                    builds);

                                workflowLength = nextJobs.size;
                            }

                            for (let i = builds.length; i < workflowLength; i += 1) {
                                buildsStatus[i] = 'unknown';
                            }

                            return reply.redirect(getUrl(badgeService, buildsStatus));
                        });
                    });
                })
                .catch(() => reply.redirect(getUrl(badgeService)));
        },
        validate: {
            params: {
                id: idSchema
            }
        }
    }
});
