// ContextProvider — the seam between Rocky and where lab data comes from.
// Swap the implementation without touching the engine. Today: fixtures.
// When CloudLabs API auth lands (checklist A1), LiveCloudLabsContextProvider
// becomes real by filling in the fetches — endpoints are already mapped below.

const fs = require('fs');

/** @typedef {Object} LabContext (see fixtures/lab-context.json for shape) */

class ContextProvider {
  // eslint-disable-next-line no-unused-vars
  async getContext(_opts) { throw new Error('not implemented'); }
}

class FixtureContextProvider extends ContextProvider {
  constructor(filePath) { super(); this.filePath = filePath; }
  async getContext() {
    const raw = fs.readFileSync(this.filePath, 'utf8');
    return JSON.parse(raw);
  }
}

/**
 * Live provider — structured against the documented CloudLabs endpoints
 * (see docs/architecture.md Part 2/2b). Intentionally throws until auth is wired
 * so we never silently ship a half-connected provider.
 */
class LiveCloudLabsContextProvider extends ContextProvider {
  constructor({ baseUrl, partnerGuid, getAuthHeader } = {}) {
    super();
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
    this.partnerGuid = partnerGuid;
    this.getAuthHeader = getAuthHeader; // () => ({ Authorization: 'Bearer ...' }) — pending A1
  }

  _assertReady() {
    if (!this.baseUrl || !this.partnerGuid || typeof this.getAuthHeader !== 'function') {
      const err = new Error(
        'LiveCloudLabsContextProvider not configured: needs baseUrl, partnerGuid, and getAuthHeader. ' +
        'Auth scheme is pending platform confirmation (checklist A1).'
      );
      err.code = 'NOT_WIRED';
      throw err;
    }
  }

  // The endpoint map Rocky will assemble a context from (per docs/architecture.md):
  endpoints({ onDemandLabGuid, eventUserId, templateGuid, labGuideGuid }) {
    const p = this.partnerGuid;
    return {
      guide: `${this.baseUrl}/api/partners/${p}/labGuide/${labGuideGuid}/partner-lab-guide`,
      validationDefs: `${this.baseUrl}/api/partners/${p}/templates/${templateGuid}/template-lab-guide-validations`,
      progress: `${this.baseUrl}/api/partners/${p}/labs/${onDemandLabGuid}/progress/users/${eventUserId}`,
      validationResults: `${this.baseUrl}/api/partners/${p}/labs/${onDemandLabGuid}/users/${eventUserId}/validation-results`,
      activityLog: `${this.baseUrl}/api/partners/${p}/labs/${onDemandLabGuid}/deployment-activity-log`,
    };
  }

  async getContext(opts = {}) {
    this._assertReady();
    // TODO(A1): fetch each endpoint with this.getAuthHeader(), then map the
    // responses into the LabContext shape (same as fixtures/lab-context.json).
    // Kept unimplemented on purpose until auth is confirmed.
    throw Object.assign(new Error('Live fetch not implemented until auth is confirmed (A1).'), { code: 'NOT_WIRED' });
  }
}

module.exports = { ContextProvider, FixtureContextProvider, LiveCloudLabsContextProvider };
