// River pages ship a full month of USGS daily summaries in their markup, which is
// what a crawler indexes and what loads with no JavaScript at all. This fills in
// the one column that has to be current — the reading right now — after paint.
(function () {
  const cells = [...document.querySelectorAll('[data-live-gage]')];
  if (!cells.length) return;
  const sites = cells.map((c) => c.dataset.liveGage);
  const cToF = (c) => c * 9 / 5 + 32;
  const classify = (f) => (f >= 65 ? 'danger' : f >= 60 ? 'caution' : 'safe');
  const label = (c) => (c === 'danger' ? 'Too warm to fish' : c === 'caution' ? 'Caution' : 'Safe');
  const status = document.getElementById('status');
  const say = (m) => { if (status) status.textContent = m; };

  const url = 'https://waterservices.usgs.gov/nwis/iv/?format=json'
            + '&sites=' + sites.join(',') + '&parameterCd=00010&siteStatus=active';

  fetch(url)
    .then((r) => { if (!r.ok) throw new Error('USGS returned ' + r.status); return r.json(); })
    .then((body) => {
      const latest = new Map();
      for (const ts of body?.value?.timeSeries || []) {
        const id = ts.sourceInfo?.siteCode?.[0]?.value;
        const vals = ts.values?.[0]?.value || [];
        const last = vals[vals.length - 1];
        if (!id || !last) continue;
        const c = Number(last.value);
        if (!Number.isFinite(c) || c < -50 || c > 60) continue;
        // A gage can report several sub-series; the freshest wins.
        const prev = latest.get(id);
        if (prev && prev.time >= last.dateTime) continue;
        latest.set(id, { f: cToF(c), time: last.dateTime });
      }
      let filled = 0;
      let stale = 0;
      for (const cell of cells) {
        const hit = latest.get(cell.dataset.liveGage);
        if (!hit) { cell.innerHTML = '<span class="muted">no reading</span>'; continue; }
        const takenAt = new Date(hit.time);
        const ageHours = (Date.now() - takenAt.getTime()) / 3600e3;
        // USGS keeps returning the last value a decommissioned gage ever sent, so
        // "latest" can be years old. Printing that under a column headed "Now"
        // would be a lie of exactly the kind this site exists to avoid.
        if (ageHours > 24) {
          stale++;
          cell.className = 'num live';
          cell.innerHTML = '<span class="muted">' + hit.f.toFixed(1) + '&deg;F · '
            + Math.round(ageHours / 24) + 'd old</span>';
          cell.title = 'This gage last reported on ' + takenAt.toLocaleString()
            + '. Too old to call current.';
          continue;
        }
        filled++;
        const cls = classify(hit.f);
        // The badge in the last column is the month's verdict and stays put; the
        // live class belongs on the reading it actually describes.
        cell.className = 'num live ' + cls;
        cell.innerHTML = hit.f.toFixed(1) + '&deg;F';
        cell.title = label(cls) + ' — reading taken ' + takenAt.toLocaleString();
      }
      say(filled + ' of ' + cells.length + ' gages reporting a current temperature'
        + (stale ? ', ' + stale + ' last reported over a day ago' : '') + '.');
    })
    .catch((e) => {
      for (const cell of cells) cell.innerHTML = '<span class="muted">—</span>';
      say("Couldn't reach the USGS service for live readings — " + e.message
        + '. The monthly summaries on this page are unaffected.');
    });
})();
