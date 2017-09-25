var BACKEND_URL='http://localhost:8888';

var m = 0;
var s = 0;
var clockId;

var eventSource           = null;
var eventHistory          = null; 
var currHistoryIndex      = 0;
var time_elapsed          = new Date();
var timemachine           = false;

var selectingTarget       = false;
var pollInterval          = false;
var chord                 = false;
var rec_messages          = false;
var selectDisconnect      = false;
var selectionActive       = false;

//counters
var upnodes               = 0;
var uplinks               = 0;

var eventCounter          = 0;
var msgCounter            = 0;
var nodeAddCounter        = 0;
var nodeRemoveCounter     = 0;
var connAddCounter        = 0;
var connRemoveCounter     = 0;
var sources               = [];
var connsById             = {};

var doLog                 = false;

var visDOM                = "#3d-graph";
var visDOMClone           = null;
var detail                = {};

var nodesById             = {};          
var selectedNode          = null;
var updateSelection       = false;

var operation             = "";
var initialized           = false;

var snapshotMode          = false; 

var frozen                = false;

const HIGHLIGHT_LINK_COLOR  = 0x07C288;
const NORMAL_LINK_COLOR     = 0xf0f0f0;



var startTimer = function () {
  clockId = setInterval(function(){
    s++;
    var temps= s%60;
    m = Math.floor(s/60);
    h = Math.floor(m/60);
    var val = "" + (h>9?"":"0") + h + ":" +(m>9?"":"0") + m + ":" + (temps>9?"":"0") + temps;
    $("#time-elapsed").text(val);
  },1000);
};

var resetTimer = function() {
  $("#time-elapsed").text("00:00:00");
  s=0;
}

function setVisualisationFrame() {
  var w = window,
    d = document,
    e = d.documentElement,
    g = d.getElementsByTagName('body')[0],
    x = w.innerWidth || e.clientWidth || g.clientWidth,
    y = w.innerHeight|| e.clientHeight|| g.clientHeight;
  
  var viswidth = x * 60 / 100;
  var visheight = y * 85 / 100;
  $(visDOM).css("display", "inline-block");
  $(visDOM).css("width", viswidth);
  $(visDOM).css("height", visheight);

  visDoOMClone = $(visDOM).clone(false,false);
}

function pollServer() {
  pollInterval = setInterval(function() {
  $.get(BACKEND_URL + "/alive").then(
    function(d) {
      console.log("Backend is running");
      $("#backend-nok").hide();
      $("#backend-ok").fadeIn().css('display', 'inline-block');
    },
    function(d) {
      console.log("Backend is NOT running");
      $("#backend-nok").show("slow");
      $("#backend-ok").hide("slow");
    }
   );
  }, 1000);
}

function setupEventStream() {
  let queryOptions = setupFilterOptions();
  let url = BACKEND_URL + '/events?current=true' + queryOptions;
  //console.log(url);

  eventSource = new EventSource(url);

  eventSource.addEventListener("network", function(e) {
    var event = JSON.parse(e.data);

    if (event.control) {
      return;
    }

    handleEvent(event);

    var evtCopy = $.extend(true, {}, event);
    eventHistory.push({timestamp:$("#time-elapsed").text(), content: evtCopy});
    if (updateSelection) {
      self.sidebar.updateGraph(selectedNode);    
    }
  });

  eventSource.onopen = function() {
    startViz(); 
    $("#message-filters").attr("disabled","disabled");
    if ($("#showlogs").is(":checked")) {
      doLog = true;
      $("#output-window").show("slow");
    }
  };

  eventSource.onerror = function() {
    $("#power").addClass("power-off");
    $("#power").removeClass("power-on");
    $("#error-messages").show();
    $("#error-reason").text("Has the backend been shut down?");
    $("#backend-nok").show("slow");
    $("#backend-ok").hide("slow");
    $(".display .label").text("Disconnected");

    clearInterval(clockId);
    //console.log(new Date());
  }
}

function handleEvent(event) {
    switch(event.type) {

      case "node":
        handleNodeEvent(event);
        break;
      
      case "conn":
        handleConnEvent(event); 
        break;

      case "msg":
        handleMsgEvent(event);
        break;

    }
    eventCounter++;
    update3DGraph();
}

function toggleFreeze() {
  $("#freeze").toggleClass("power-off");
  frozen = !frozen;
  let ori = $("#3d-graph");
  if (frozen) {
    ori.css("visibility", "hidden");
    var clone = $("<div id='frozen'></div>");
    ori.parent().append(clone);
    var clonedData = $.extend(true,{},graphData);  
    var cloneGraph = ForceGraph3D()
                (document.getElementById("frozen"))
                .graphData(clonedData);
    clone.find("canvas").css("position","absolute");
    clone.find("canvas").css("top","0");
    cloneGraph.onNodeClick(nodeSelected);
    cloneGraph.cooldownTime(0);
  } else {
    $("#frozen").remove();
    ori.css("visibility","visible");
  }
}

function setupFilterOptions() {
  let queryOptions = "";
  if (rec_messages) {
    let proto = $("input[name=selected-protocol]:checked").val();
    // console.log(proto);
    queryOptions = "&filter=" + proto;
    if (proto != "devp2p") {
      let code = "";
      if ($("#msg-code").val() != "") {
        code = $("#msg-code").val();
      } 
      queryOptions += ":" + code;
    } else {
      queryOptions +=  ":" + $("input[name=devp2p-option]:checked").val();
    } 
  }
  return queryOptions;
}

function handleNodeEvent(event) {
  var el = {
    id: event.node.config.id,
    label: event.node.config.id,
    name: event.node.config.name,
    up: event.node.up,
    info: event.node.info
    //control: event.control,
  };
  if (el.up) {
    addNode(el);
  } else {
    removeNode(el);
  }
}

function addNode(el) {
   graphData.nodes.push(el); 
   nodeAddCounter++;
   if (el.info && el.info.protocols) {
    el.overlay = el.info.protocols["bzz"];
   }
   nodesById[el.id] = el;
   if (doLog) {
      writeLog("node",event.control,el.id,"ADD");
   }
}

function removeNode(el) {
  //console.log("removing node");
  var idx = graphData.nodes.findIndex(function(o) {
    return o.id === el.id;
  });
  //console.log(idx);
  if (idx > -1) {
    let prop = el.id;
    graphData.nodes.splice(idx, 1);
    nodeRemoveCounter++;
  }
  if (doLog) {
    writeLog("node",event.control,el.id,"REMOVE");
  }
}

function handleConnEvent(event) {
  //console.log(event.conn.distance);
  var el = {
    id:     event.conn.one + "-" + event.conn.other,
    source: event.conn.one,
    target: event.conn.other,
    color:  NORMAL_LINK_COLOR,
    opacity: 0.2
    //control: event.control
  };

  if (event.conn.up) {
    addConnection(el);
  } else {
    removeConnection(el);
  }

  if (selectedNode && (selectedNode.id == el.source || selectedNode.id == el.target)) {
    //there's an active selected node, so update node details
    updateSelection = true;
  }
}

function addConnection(el) {
  graphData.links.push(el);
  connAddCounter++;
  if (nodesById[el.source].overlay && nodesById[el.target].overlay) {
    el.distance = (10 - DefaultPof(nodesById[el.source].overlay, nodesById[el.target].overlay,0)) * 10;
  } else {
    el.distance = 80;
  }
  //console.log(el.distance);

  if (doLog) {
    writeLog("conn",event.control,el.id,"ADD");
  }

  if (!connsById[el.id]) {
    connsById[el.id] = {};
    connsById[el.id].msgCount = 0;
    connsById[el.id].connCount= 0;
    connsById[el.id].source = el.source;
    connsById[el.id].target = el.target;
  };
  connsById[el.id].connCount += 1;
  if (sources.indexOf(el.source) == -1) {
    sources.push(el.source);
  }
}

function removeConnection(el) {
  var idx = graphData.links.findIndex(function(o) {
    return o.id === el.id;
  });

  if (idx > -1) {
    graphData.links.splice(idx, 1);
    connRemoveCounter++;
  }

  if (doLog) {
    writeLog("conn",event.control,el.id,"REMOVE");
  }
}

function handleMsgEvent(event) {
  if (!rec_messages) {
    return;
  }
  this.graphData.msgs.push({
    id:     event.msg.one + "-" + event.msg.other,
    source: event.msg.one,
    target: event.msg.other,
    up:     event.msg.up,
    //control: event.control
  });
  msgCounter++;
  if (connsById[el.id] && connsById[el.id].msgCount !== undefined) {
    connsById[el.id].msgCount += 1;
  }
  if (doLog) {
    writeLog("msg",event.control,el.id,"");
  }
}

function selectMockerBackend(id) {
  selectedSim = id;
  $('#selected-simulation').text(selectedSim);
  funcClose();
}

function terminateTimemachine() {
  pauseReplay();
  resetVisualisation();
  $(".timemachine-section").hide("fast");
  $("#power").addClass("power-off");
  $("#power").removeClass("power-on");
  $("#play").addClass("invisible");
  $("#play").addClass("fa-play-circle");
  $("#play").removeClass("fa-pause");
  $("#refresh").addClass("invisible");
  $("#show-conn-graph").addClass("invisible");
}
  
function startViz(){
  if (snapshotMode) {
    console.log("Snapsshot mode; not starting node simulator");
    return;
  }
  $.post(BACKEND_URL + "/mocker/start",{"node-count": $("#node-count").val(), "mocker-type":$("#mocker-type-selector").val()}).then(
    function(d) {
      startTimer();
      $(".display .label").text("Simulation running");
      //console.log(new Date());
      $("#rec_messages").attr("disabled",true);
      $("#power").removeClass("power-off");
      $("#power").addClass("power-on");
      $("#power").prop("disabled", true);
      $("#stop").removeClass("invisible");
      $("#freeze").removeClass("invisible");
      $("#start").addClass("invisible");
      $("#upload").addClass("invisible");
      $("#snapshot").removeClass("invisible");
      $("#search-node").removeClass("invisible");
  }, function(e) {
      $("#error-messages").show();
      $("#error-reason").text("Is the backend running?");
  })
}

function initializeServer(){
  eventHistory = [];
  this.sidebar = new P2Pd3Sidebar('#sidebar', this);
  $("#error-messages").hide();
  $(".display").css({"opacity": "1"});
  $.get(BACKEND_URL).then(
    function(d){
      //console.log(d);
      //console.log("Backend ok");
      $(".elapsed").show();
      $("#start").removeClass("invisible");
      $("#refresh").addClass("invisible");
      $("#upload").removeClass("invisible");
      //clearInterval(pollInterval);
    },
    function(e,s,err) {
      $("#error-messages").show();
      $("#error-reason").text("Is the backend running?");
      console.log("Error connecting to backend at: " + BACKEND_URL);
      console.log(e);
    });
  $.get(BACKEND_URL + "/mocker").then(
    function(d){
      let mockerlist = d;
      for (let i=0;i<mockerlist.length; i++) {
        let option = $('<option id="' + mockerlist[i] + '" value="' + mockerlist[i] + '">' + mockerlist[i] + '</option>');
        if (mockerlist[i] == "probabilistic") {
          option.attr("selected","selected");
        } 
        $("#mocker-type-selector").append(option);
      } 
    },
    function(e,s,err) {
      console.log("error getting mocker list");
      console.log(e);
    });
};

function startSim() {
  $(".display .label").text("Connecting with backend...");
  snapshotMode = false;
  init3DVisualisation();
  setupEventStream();
}

function stopNetwork() {
  //visualisation.simulation.stop();
  $(".display .label").text("Stop network: waiting for backend...");
  $("#stop").addClass("stale");
  $("#power").addClass("stale");
  
  $.post(BACKEND_URL + "/reset");
  $.post(BACKEND_URL + "/mocker/stop").then(
    function(d) {
      eventSource.close();
      clearInterval(clockId);
      resetTimer();
      resetVisualisation();
      $("#search-node").addClass("invisible");
      $("#stop").addClass("invisible");
      $("#stop").removeClass("stale");
      $("#snapshot").addClass("invisible");
      $("#freeze").addClass("invisible");
      $("#show-conn-graph").removeClass("invisible");
      $(".display .label").text("Simulation stopped. Network deleted.");
      $("#rec_messages").attr("disabled",false);
      $("#power").removeClass("power-on");
      $("#power").addClass("power-off");
      $("#power").removeClass("stale");
      $("#refresh").removeClass("invisible");
      $('#power').find('.control-label').text("Reset");
    },
    function(d) {
      $(".display .label").text("Failed to stop network!");
      $("#stop").removeClass("stale");
      $("#power").removeClass("stale");
    }
  );
}

function resetUI() {
  $("#show-conn-graph").addClass("invisible");
  $("#search-node").addClass("invisible");
  $("#refresh").addClass("invisible");
  $("#power").removeClass("power-on");
  $("#power").addClass("power-off");
}

function replayViz() {
  $("#timemachine").show();
  setupTimemachine();
  $("#stop").addClass("invisible");
  $("#refresh").addClass("invisible");
  $("#play").removeClass("invisible");
  $(".timemachine-section").show("slow");
  $(".display .label").text("Replaying last simulation run.");
}

function takeSnapshot() {
  $.get(BACKEND_URL + "/snapshot").then(
    function(d) {
      //console.log("Snapshot successfully taken");
      //console.log(d);
      saveSnapshot(JSON.stringify(d));
    },
    function(d) {
      console.log("Snapshot failed.");
      console.log(d);
    });
}

function uploadSnapshot() {
  var input = document.createElement("input");
  input.type = "file";
  input.addEventListener("change", doUploadSnapshot, false);
  input.click();
}

function doUploadSnapshot() {
  //console.log(this.files);
  var f = this.files[0];
  //console.log(f);
  var reader = new FileReader();
  reader.readAsText(f);
  reader.onload = function(e) {
    var snapshot = reader.result;
    $.post(BACKEND_URL + "/snapshot", snapshot).then(
      function(d){
        snapshotMode = true;
        console.log("snapshot uploaded");
        init3DVisualisation();
        setupEventStream();
        $("#upload").addClass("invisible");
        $("#start").addClass("invisible");
        $("#stop").removeClass("invisible");
      },
      function(e){
        console.log("Uploading snapshot failed");
        console.log(e);
        $.post(BACKEND_URL + "/reset");
      });
  }
  reader.onerror = function(e) {
    console.log("ERROR loading snapshot file!");
  }
}

function saveSnapshot(snapshot) {
  var a = document.createElement("a");
  var file = new Blob([snapshot], {type: "text/plain"});
  a.href = URL.createObjectURL(file);
  a.download = "Snapshot_" + Date.now() + ".js";
  a.click();  
}

function showConnectionGraph() {
  d3.select("#chord-diagram").selectAll("*").remove();
  putOverlay();
  chord = new P2PConnectionsDiagram();  
  chord.setupDiagram(false);
  var dialog = $("#connection-graph");
  var diagram = $("#chord-diagram");
  if (rec_messages) {
    $("#toggle-chord").removeClass("invisible");
  }
  dialog.show("slow");
  dialog.css({
          'margin-left': 0-dialog.outerWidth() / 2 + 'px',
          'margin-top':  0-dialog.outerHeight() / 2 + 'px',
          'visibility': "visible"
  });
  dialog.append('<div id="close" class="close" onclick="funcClose(this);">X</div>');
} 

function putOverlay() {
  $('#Overlay').show();
}

function funcClose() {
  $("#Overlay").hide("slow");
  $(".ui-dialog").hide("slow");
  $("#close").remove();
}

function init3DVisualisation() {

  this.graphData = {
    nodes: [],
    links: [],
    msgs:  []
  };
  var orinode = document.getElementById("3d-graph")
  var clone = orinode.cloneNode();
  var parent = orinode.parentNode;
  parent.removeChild(orinode);
  parent.append(clone);
  vis3D = ForceGraph3D()
                (document.getElementById("3d-graph"))
                .graphData(this.graphData);
  vis3D.onNodeClick(nodeSelected);
  vis3D.cooldownTime(10000);

  var canvas = $(visDOM).find("canvas");
  canvas.attr("width", $(visDOM).css("width"));
  canvas.attr("height", $(visDOM).css("height"));
  canvas.attr("position", "fixed");

}

function resetVisualisation() {
  vis3D.resetProps();
  graphData = {
    nodes: [],
    links: [],
    msgs:  []
  };
  sidebar.resetCounters();
  sidebar.clearSelection();
  vis3D.graphData(this.graphData);
  $(visDOM).find("canvas").html("");
  //document.getElementById("3d-graph") = document.getElementById("3d-graph"),cloneNode();
}

function nodeSelected(node) {
  $(".sm-dialog").hide();
  selectedNode = node;
  if (this.detailView) {
    this.detailView = null;
  }
  self.sidebar.updateSidebarSelectedNode(node);    
}

function update3DGraph() {
  if (rec_messages) {
    processMsgs(this.graphData);
  }
  this.vis3D.graphData(this.graphData);
  this.sidebar.updateSidebarCounts(this.graphData.nodes, this.graphData.links);
}

function processMsgs(data) {
  let links = data.links;
  let msgs  = data.msgs;
  for (m of msgs) {
    for (l of links) {
      if (l.id == m.id) {
        l.color = HIGHLIGHT_LINK_COLOR; 
        l.opacity = 1;
      } else {
        l.color = NORMAL_LINK_COLOR;
        l.opacity = 0.2;
      } 
    }
  }
}

function writeLog(type, control, id,  data) {
  var str = type + " - " + " Control: " + control + " - " + id + " - " + data + "</br>";
  $("#log-console").prepend(str);
}

function updateVisualisationWithClass(graph) {
  var self = this;


  var elem = document.getElementById('output-window');
  elem.scrollTop = elem.scrollHeight;

  self.visualisation.updateVisualisation(graph);
};


function showMenu() {
  $('menu').show();
}

function updateKadTable(nodeId) {
  this.sidebar.getNodeInfo(nodeId);
  console.log("Kad table of selected Node updated");
}

// DefaultPof returns a proximity order comparison operator function
// where all
//function DefaultPof(one, other Val, pos int) (int, bool) {
function DefaultPof(one, other, pos) {
  const MAX = 256
  let po = proximityOrder(ToBytes(one), ToBytes(other), pos);
  if (po >= MAX) {
		po = MAX;
  }
  return po
}

//function proximityOrder(one, other []byte, pos int) (int, bool) {
function proximityOrder(one, other, pos) {
	for (let i=pos / 8; i< one.length; i++) {
		if (one[i] == other[i]) {
			continue
		}
		let oxo = one[i] ^ other[i];
		let start = 0;
		if (i == pos/8) {
			start = pos % 8;
		}
		for (let j=start; j<8; j++) {
			if (oxo>>(7-j)&0x01 != 0) {
				return i*8 + j;
			}
		}
	}
	return one.length * 8
}

function ToBytes(str) {

  var utf8 = unescape(encodeURIComponent(str));

var arr = [];
for (var i = 0; i < utf8.length; i++) {
    arr.push(utf8.charCodeAt(i));
}
  return arr;

  var bytes = [];
  let charCode;

  for (let i = 0; i < str.length; ++i) {
    charCode = str.charCodeAt(i);
    bytes.push((charCode & 0xFF00) >> 8);
    bytes.push(charCode & 0xFF);
  }
  return bytes;
}





