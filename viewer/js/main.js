$(function() {
  displayManifestUrl();
  requestManifestFromBackground();

  $('#manifest-url').on('click', function(e) {
    // This lets us use an anchor tag, but block the typical link opening action,
    //   so we can orient what we want to occur.
    e.preventDefault();

    var url = getManifestUrl();

    chrome.runtime.sendMessage({
      action:'ignore-next-request-from',
      url: url
    });
    window.location.href = url;
  });
});

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (!('tab' in sender)) { // ignore messages from other tabs
      processManifest(request.manifest);

    }
  }
);

$.urlParam = function(name){
  var results = new RegExp('[\\?&]' + name + '=([^&#]*)').exec(window.location.href);
  if (!results) {
    return 0;
  }
  return results[1] || 0;
};

function getManifestUrl() {
  return decodeURIComponent($.urlParam('manifest'));
}

function displayManifestUrl(){
  var manifestUrl = getManifestUrl();
  $('#manifest-url').attr('href', manifestUrl).text(manifestUrl);
}

function requestManifestFromBackground() {
  var manifestUrl = getManifestUrl();
  chrome.runtime.sendMessage({
    manifestUrl: manifestUrl,
    action: 'get-manifest-for-tab'
  });
}

function processManifest(manifest) {
  window.manifest = manifest;
  
  // parse out URIs and their replacements
  var manifestParser = new ManifestParser(manifest),
      uriMap = manifestParser.createUriMap();

  // flip from hls to xml if payload starts with an xml/dash tag
  var formatType = 'm3u8';
  if(manifest.startsWith('<')){
    formatType = 'xml';
  }

  // apply the text to be formatted t the pre code section
  $('pre').addClass('language-' + formatType).find('code').text(manifestParser.manifest);
  // highlight the content using prism.js
  Prism.highlightAll();
  // override the identified URIs with anchor tags
  manifestParser.overrideLinks(uriMap);

  $('.loader').hide();
}

function ManifestParser(manifestContent){
  this.manifest = manifestContent;

  function getManifestUrlWithPath() {
    return this.getManifestUrl().match(/^([a-z]+:\/\/[^?]+\/)/i)[0];
  }

  function getManifestUrlWithoutPath() {
    return this.getManifestUrl().match(/^([a-z]+:\/\/[^/]+)/i)[0];
  }

  function isRelative(url) {
    // var r = new RegExp('^(?:[a-z]+:)?//', 'i');
    return !/^(?:[a-z]+:)?\/\//i.test(url);
  }

  function getEvaluatedUri(uriReference){
    var evaluatedUri = uriReference;
    // if the link is relative
    if (isRelative(uriReference)) {
      // if the link starts with a forward slash, then
      if(uriReference.startsWith('/')){
        // use the base URI from the manifest with the reference URI
        evaluatedUri = getManifestUrlWithoutPath() + uriReference;
      } else {
        // otherwise use the base URI with the path included
        evaluatedUri = getManifestUrlWithPath() + uriReference;
      }
    }

    return evaluatedUri;
  }

  function getUrisFromLine(line){
    var uriMatch = /(?:<[^\/]+URL)>([^<]*)<|(?:URI|src)="([^"]*)"|(^[^"#<]+$)|([a-z]+:\/\/[^"#<]+)/gmi.exec(line),
        uriArray = [],
        uriMatchLength = uriMatch ? uriMatch.length : 0;
    if(uriMatchLength > 1){
      for(var i = 1; i < uriMatch.length; i++){
        if(uriMatch[i]){
          uriArray.push(uriMatch[i].trim());
        }
      }
    }
    return uriArray;
  }

  this.getManifestUrl = function() {
    return this.manifestUrl ? this.manifestUrl : decodeURIComponent($.urlParam('manifest'));
  };

  this.createUriMap = function(){
    var lines = manifest.split("\n"),
        linesLength = lines.length,
        uriMap = {};

    for(i in lines) {
      var l = lines[i],
          capturedUris = getUrisFromLine(l),
          capturedUrisLength = capturedUris.length;
      for(var j = 0; j < capturedUrisLength; j++){
        var capturedUri = capturedUris[j],
            evaluatedUri = getEvaluatedUri(capturedUri),
            token = `replace-${random()}`;
        if(uriMap[capturedUri]){
          console.log('Found a matching tag, using preexisting token.');
          token = uriMap[capturedUri].token;
        }
        lines[i] = l.replace(capturedUri, `###${token}###${capturedUri}###end-${token}###`);
        if(!uriMap[capturedUri]){
          uriMap[capturedUri] = {
            replaceWith: `<a href="${evaluatedUri.replace(/\n/, '')}">${capturedUri}</a>`,
            token: token
          };
        }
      }
    }

    this.manifest = lines.join("\n");

    return uriMap;
  };

  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  function random (length){
    var len = length === undefined ? 10 : length,
        str = '';

    for(var i = 0; i < len; i++){
      str += chars[(Math.round(Math.random() * (chars.length - 1)))];
    }
    return str;
  }

  // function getPercentage(current, total, modifier, offset){
  //   return Math.round(current / (total / modifier) * 100, 2) + (offset ? offset : 0);
  // }

  this.overrideLinks = function(uriMap) {
    var lines = $('pre code').html();
    for(var capturedUri in uriMap){
      let obj = uriMap[capturedUri];
      let token = obj.token;
      lines = lines.replace(new RegExp(`###${token}###[^#]*###end-${token}###`, 'g'), obj.replaceWith);
    }
    $('pre code').html(lines);
  };

  return this;
}