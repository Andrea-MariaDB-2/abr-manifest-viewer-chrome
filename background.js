window.ignoreUrls = {};

var CHROME_FILTER_SETTINGS = {
  urls: ["*://*/*.m3u8*", "*://*/*.mpd*"],
  // We only want HLS manifest links loaded as the main page and
  // not as part of a video player so restrict to main_frame.
  types: ["main_frame"]
};

// sites where we have intercepted an m3u request but we don't want to because 
// the site handles it
var urlsWeBreak = [
    'demo.theoplayer.com/test-your-stream-with-statistics',
    'video-dev.github.io/hls.js/demo'
  ];

/********************
 *
 * Called on every main 
 * tab page request that chrome makes
 *
 *******************/
var filterForHLSRequests = function(requestInfo) {
  var url = requestInfo.url,
      viewerBaseUrl = chrome.extension.getURL('/viewer/index.html');

  /************************************
   *
   * https://tools.ietf.org/html/draft-pantos-http-live-streaming-20#section-4
   * "...the path MUST end with either .m3u8 or .m3u."
   *   OR
   * "the HTTP Content-type MUST be "application/vnd.apple.mpegurl" or "audio/mpegurl""
   *
   ***********************************/

  if (url.indexOf('.m3u8') != -1 ||
      url.indexOf('.mpd') != -1) {
    
    // ignore urls we reportedly break
    for (var i = urlsWeBreak.length - 1; i >= 0; i--) {
      if(url.indexOf(urlsWeBreak[i]) != -1) {
        return;
      }
    }

    if (url.indexOf(viewerBaseUrl) != -1) { // ignore requests from special viewer
      return;
    }
    
    if (window.ignoreUrls[url]) { // ignore requests user wants to load without parsing
      clearIgnoreUrl(url);
      return;
    }
    
    // tab requesting manifest to load custom viewer
    chrome.tabs.update(requestInfo.tabId, {
      url: viewerBaseUrl + "?manifest=" + encodeURIComponent(url)
    });
    
    return {cancel: true} // block downloading the manifest as a file
  }
};

chrome.webRequest.onBeforeRequest.addListener(
  filterForHLSRequests, // function to decide what to do with request
  CHROME_FILTER_SETTINGS, 
  ["blocking"] // what we want to be able to do with request
);

// when a viewer page requests we pull the HLS manifest 
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.action == 'get-manifest-for-tab') {
      getManifestForTab(request.manifestUrl, sender.tab.id);
    } else if (request.action == 'ignore-next-request-from') {
      ignoreNextRequestFrom(request.url);
    } else {
      console.log(request);
    }
  }
);

var ignoreNextRequestFrom = function(url) {
  window.ignoreUrls[url] = 1;
  window.ignoreUrls;
};

var clearIgnoreUrl = function(url) {
  delete window.ignoreUrls[url];
};

var ajaxMe = function(url, callback, roundTrip = false) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.onreadystatechange = function() {
    let responseText = xhr.responseText;

    if (xhr.readyState == 4) {
      if (xhr.status == 404) {
        responseText = "Unable to load the manifest because the server returned a 404 not found error. Please double check the URL and try again.";
      } else if (xhr.status == 0 && xhr.statusText == "") {
        responseText = "Unable to load the Manifist. Common issues include invalid SSL certificate for domain. As a workaround, try clicking the link above to download the manifest file directly.";
      }

      callback(responseText, roundTrip);
      
    }
  }
  
  xhr.send();
};

var getManifestForTab = function(manifestUrl, requesterTabId) {
  ajaxMe(
    manifestUrl, 
    returnManifest, // callback function(manifest, requesterTabId)
    requesterTabId  // roundtrip -> data to send back with callback
  );
};

var returnManifest = function(manifest, requesterTabId, manifestType) {
  chrome.tabs.sendMessage(requesterTabId, {
    manifest: manifest,
    type: manifestType
  });
};

