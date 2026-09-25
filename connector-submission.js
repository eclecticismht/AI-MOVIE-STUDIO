const crypto = require('node:crypto');

async function reconcile(job, request) {
  if (!job.submissionPending || !job.submissionId) return null;
  const queue = await request('/queue');
  const history = await request('/history?max_items=500');
  const entries = [...(queue.queue_running || []), ...(queue.queue_pending || []), ...Object.values(history).map(record => record.prompt).filter(Boolean)];
  const found = entries.find(entry => entry[3]?.ams_submission_id === job.submissionId && entry[3]?.ams_job_id === job.id);
  if (!found) return null;
  job.comfyPromptId = found[1];
  job.comfyNumber = found[0];
  job.submissionPending = false;
  return {prompt_id: found[1], number: found[0], recovered: true};
}

async function submit(job, {request, persist, graph}) {
  if (job.submissionPending) {
    const recovered = await reconcile(job, request);
    if (recovered) return recovered;
    throw Error('提交结果尚未确认，已阻止重复生成。请同步状态并检查渲染器队列；原任务和素材已保留。');
  }
  job.executionGraph ||= graph(job);
  job.submissionId = crypto.randomUUID();
  job.submissionPending = true;
  job.submissionStartedAt = new Date().toISOString();
  persist();
  let result;
  try {
    result = await request('/prompt', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
      client_id: 'ai-movie-studio', prompt: job.executionGraph,
      extra_data: {ams_job_id: job.id, ams_submission_id: job.submissionId}
    })});
  } catch (error) {
    if (error.upstreamRejected) job.submissionPending = false;
    throw error;
  }
  if (typeof result.prompt_id !== 'string' || !result.prompt_id) throw Error('渲染器未返回任务编号，提交结果待确认；请同步状态。');
  job.submissionPending = false;
  return result;
}

module.exports = {submit, reconcile};
