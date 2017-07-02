var BACKEND_URL='http://localhost:8888';

var m = 0;
var s = 0;
var clockId;

var mockerlist            = [];
var mockerlist_generated  = false;
var defaultSim            = "default";
var selectedSim           = defaultSim;

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
  $("#network-visualisation").attr("width", viswidth);
  $("#network-visualisation").attr("height", visheight);
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
  eventSource = new EventSource(BACKEND_URL + '/events?current=true');

  eventSource.addEventListener("network", function(e) {
    var event = JSON.parse(e.data);

    var graph = {
      newNodes: [],
      newLinks: [],
      removeNodes: [],
      removeLinks: [],
      message: []
    };

    switch(event.type) {

      case "node":
        if (event.control) {
          return;
        }

        var el = {
          id: event.node.config.id,
          label: event.node.config.id,
          control: event.control,
          name: event.node.config.name,
          up: event.node.up
        };

        if (event.node.up) {
          graph.newNodes.push(el);
        } else {
          graph.removeNodes.push(el);
        }

        break;

      case "conn":
        var el = {
          distance: 9 - (event.conn.distance / 10),
          id:     event.conn.one + "-" + event.conn.other,
          source: event.conn.one,
          target: event.conn.other,
          control: event.control
        };

        if (event.conn.up) {
          graph.newLinks.push(el);
        } else {
          graph.removeLinks.push(el);
        }

        break;

      case "msg":
        if (!rec_messages) {
          return;
        }
        graph.message.push({
          id:     event.msg.one + "-" + event.msg.other,
          source: event.msg.one,
          target: event.msg.other,
          up:     event.msg.up,
          control: event.control
        });

        break;

    }
    eventCounter++;
    updateVisualisationWithClass(graph);
    //console.log(eventCounter);
  });

  eventSource.onopen = function() {
    startViz();
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

function selectMockerBackend(id) {
  selectedSim = id;
  $('#selected-simulation').text(selectedSim);
  funcClose();
}

function clearViz() {
  d3.select("#network-visualisation").selectAll("*").remove();
  visualisation.sidebar.resetCounters();
  $("#power").removeClass("power-off");
  $("#power").addClass("power-on");
  $("#play").addClass("invisible");
  $("#play").addClass("fa-play-circle");
  $("#play").removeClass("fa-pause");
  $("#refresh").addClass("invisible");
  $("#show-conn-graph").addClass("invisible");
  $(".timemachine-section").hide("fast");
  $("#timemachine-visualisation").hide();
  $("#network-visualisation").show();
}


function startViz(){
  $.post(BACKEND_URL + "/mock/" + selectedSim).then(
    function(d) {
      startTimer();
      $(".display .label").text("Simulation running");
      //console.log(new Date());
      $("#rec_messages").attr("disabled",true);
      $("#power").removeClass("power-off");
      $("#power").addClass("power-on");
      $("#stop").removeClass("invisible");
      $("#start").addClass("invisible");
      $("#upload").addClass("invisible");
      $("#snapshot").removeClass("invisible");
  }, function(e) {
      $("#error-messages").show();
      $("#error-reason").text("Is the backend running?");
  })
}

function initializeServer(){
  eventHistory = [];
  initializeVisualisationWithClass();
  $("#error-messages").hide();
  $(".display").css({"opacity": "1"});
  $.get(BACKEND_URL).then(
    function(d){
      console.log(d);
      //console.log("Backend ok");
      $(".elapsed").show();
      $("#start").removeClass("invisible");
      $("#refresh").addClass("invisible");
      $("#upload").removeClass("invisible");
      d3.select("#network-visualisation").selectAll("*").remove();
      //clearInterval(pollInterval);
    },
    function(e,s,err) {
      $("#error-messages").show();
      $("#error-reason").text("Is the backend running?");
      console.log("Error connecting to backend at: " + BACKEND_URL);
      console.log(e);
    });
};

function startSim() {
  $(".display .label").text("Connecting with backend...");
  setupEventStream();
  loadExistingNodes();
  loadExistingConnections();
}

function stopNetwork() {
  visualisation.simulation.stop();
  $(".display .label").text("Stop network: waiting for backend...");
  $("#stop").addClass("stale");
  $("#power").addClass("stale");

  $.post(BACKEND_URL + "/stop").then(
    function(d) {
      eventSource.close();
      clearInterval(clockId);
      resetTimer();
      $("#stop").addClass("invisible");
      $("#stop").removeClass("stale");
      $("#snapshot").addClass("invisible");
      $("#show-conn-graph").removeClass("invisible");
      $(".display .label").text("Simulation stopped. Network deleted.");
      $("#rec_messages").attr("disabled",false);
      $("#power").removeClass("power-on");
      $("#power").addClass("power-off");
      $("#power").removeClass("stale");
      $("#refresh").removeClass("invisible");
    },
    function(d) {
      $(".display .label").text("Failed to stop network!");
      $("#stop").removeClass("stale");
      $("#power").removeClass("stale");
    }
  );
}

function loadExistingNodes() {
  $.get(BACKEND_URL + "/nodes").then(
    function(d) {
      var graph = {
        newNodes: [],
        newLinks: [],
        removeNodes: [],
        removeLinks: [],
        message: []
      };

      for (var i=0; i<d.length; i++) {
        var el = {
          id: d[i].id,
          name:d[i].name,
          up: true,
          control: false
        };
        graph.newNodes.push(el);
      }
      console.log("Successfully loaded existing node list");
      updateVisualisationWithClass(graph);
    },
    function(d) {
      console.log("Error getting nodes list from backend");
    });
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
  console.log(this.files);
  var f = this.files[0];
  //console.log(f);
  //var snapshot = JSON.parse(new FileReader().readAsText(f));
  var reader = new FileReader();
  reader.readAsText(f);
  reader.onload = function(e) {
    var snapshot = reader.result;
    $.post(BACKEND_URL + "/snapshot", snapshot).then(
      function(d){
        console.log("snapshot uploaded");
        loadExistingNodes();
        $("#upload").addClass("invisible");
        $("#start").addClass("invisible");
        $("#stop").removeClass("invisible");
      },
      function(e){
        console.log("Uploading snapshot failed");
        console.log(e);
      });
  }
  reader.onerror = function(e) {
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


function selectMocker() {
  $.get(BACKEND_URL + "/mock"). then(
    function(d) {
      console.log("Successfully retrieved mocker list");
      console.log(d);
      mockerlist = d;
      showSelectDialog();
    },
    function(e,s,err) {
      $("#error-messages").show();
      $("#error-reason").text("Failed to retrieve mocker list.");
      console.log(e);
    });
}

function showSelectDialog() {
  putOverlay();
  if (mockerlist_generated == true) {
    $("#select-mocker").show("slow");
  } else {
    var dframe = $(document.createElement('div'));
    dframe.attr("class","dialogframe");
    var table = $(document.createElement('table'));
    table.attr("class","objectlist");
    $.each(mockerlist, function(k,v) {
      var tr = $(document.createElement('tr'));
      tr.attr("class","selectelement");
      var td = $(document.createElement('td'));
      td.attr("id",k);
      td.click(function() { selectMockerBackend($(this).attr("id"));});
      td.append(v);
      tr.append(td);
      table.append(tr);
    })
    dframe.append(table);
    var dialog = $("#select-mocker");
    dialog.append(dframe);
    dialog.append('<div id="close" class="close" onclick="funcClose(this);">X</div>');
    dialog.css({
          'margin-left': -dialog.outerWidth() / 2 + 'px',
          'margin-top':  -dialog.outerHeight() / 2 + 'px',
          'visibility': "visible"
    });
    dialog.show();
    mockerlist_generated = true;
  }
}

function putOverlay() {
  $('#Overlay').show();
}

function funcClose() {
  $("#Overlay").hide("slow");
  $(".ui-dialog").hide("slow");
  $("#close").remove();
}

function initializeVisualisationWithClass(){
  this.visualisation = window.visualisation = new P2Pd3(d3.select("#network-visualisation"));
};

function updateVisualisationWithClass(graph) {
  var self = this;

  //console.log("Updating visualization with new graph");
  var evtCopy = $.extend(true, {}, graph);
  eventHistory.push({timestamp:$("#time-elapsed").text(), content: evtCopy});

  if ($("#showlogs").is(":checked")) {
    var objs = [graph.add, graph.remove, graph.message];
    var act  = [ "ADD", "REMOVE", "MESSAGE" ];
    for (var i=0;i<objs.length; i++) {
      for (var k=0; objs[i] && k<objs[i].length; k++) {
        var obj = objs[i][k];
        var str = act[i] + " - " + obj.group + " Control: " + obj.control + " - " + obj.data.id + "</br>";
        $("#log-console").append(str);
      }
    }
  }

  var elem = document.getElementById('output-window');
  elem.scrollTop = elem.scrollHeight;
console.log(graph.length)
  self.visualisation.updateVisualisation(graph);
};


function showMenu() {
  $('menu').show();
}

function loadExistingConnections() {
  $.get(BACKEND_URL).then(
    function(d) {
      console.log("loadExistingConnections cons " );
      var graph = {
        newNodes: [],
        newLinks: [],
        removeNodes: [],
        removeLinks: [],
        message: []
      };
      for (var i=0; i<d.conns.length; i++) {
      var el = {

          distance: 9 - (d.conns[i].distance / 10),
          id:     d.conns[i].one + "-" + d.conns[i].other,
          source: d.conns[i].one,
          target: d.conns[i].other,
          control: d.conns[i].control
        };

        console.log("add cons");
        graph.newLinks.push(el);
    }
      updateVisualisationWithClass(graph);
    },
    function(d) {
      console.log("Error getting nodes list from backend");
    });
}
