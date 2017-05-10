var BACKEND_URL='http://localhost:8888';

var m;
var s = 0;;
var clockId;
var runViz = null;
var pauseViz = false;
var networkname = null;
var eventSource = null;
var eventHistory = [];
var currHistoryIndex = 0;
var timemachine = false;
var time_elapsed = new Date();


var startTimer = function () {
  clockId = setInterval(function(){
    s++;
    var temps= s%60;
    m = Math.floor(s/60);
    var val = "" + m + ":" + (temps>9?"":"0") + temps;
    $("#time-elapsed").text(val);
  },1000);
};

var upnodes   = 0;
var uplinks   = 0;

$(document).ready(function() {
  
  $('#pause').prop("disabled",true);
  $('#play').prop("disabled",true);

  //click handlers
  $('#output-window').on('click', function() {
    $('#log-console').toggle();
  });
  $('#power').on('click',function(){ 
    initializeServer("0"); 
    $('#play').prop("disabled",false);
    $('#power').prop("disabled",true);
  });
  //click handlers
  $('#play').on('click',function(){ 
    if (pauseViz) {
      pauseViz = false;
      startTimer();
      $("#status-messages").hide();
    } else {
      startViz(); 
    }
    $('#play').prop("disabled",true);
    $('#pause').prop("disabled",false);
  });

  $("#pause").click(function() {
    if (clockId != null) {
      clearInterval(clockId);
      eventSource.close();
      $("#status-messages").text("Visualization Paused");
      $("#status-messages").show();
      $("#timemachine").show();
      pauseViz = true;
      $('#pause').prop("disabled",true);
      $('#play').prop("disabled",false);

      setupTimemachine();
    }
  });
});

function setupEventStream() {
  eventSource = new EventSource(BACKEND_URL + '/networks/' + networkname);

  eventSource.addEventListener("network", function(e) {
    var event = JSON.parse(e.data);

    var graph = {
      add:     [],
      remove:  [],
      message: []
    };

    switch(event.type) {

      case "node":
        if (event.control) {
          return;
        }

        var el = {
          group: "nodes",
          data: {
            id: event.node.config.id,
            up: event.node.up
          },
          control: event.control
        };

        if (event.node.up) {
          graph.add.push(el);
        } else {
          graph.remove.push(el);
        }

        break;

      case "conn":
        var el = {
          group: "edges",
          data: {
            id:     event.conn.one + "-" + event.conn.other,
            source: event.conn.one,
            target: event.conn.other,
            up:     event.conn.up
          },
          control: event.control
        };

        if (event.conn.up) {
          graph.add.push(el);
        } else {
          graph.remove.push(el);
        }

        break;

      case "msg":
        graph.message.push({
          group: "msgs",
          data: {
            id:     event.msg.one + "-" + event.msg.other,
            source: event.msg.one,
            target: event.msg.other,
            up:     event.msg.up
          },
          control: event.control
        });

        break;

    }
    updateVisualisationWithClass(graph);
  });

  eventSource.onerror = function() {
    $("#error-messages").show();
    $("#error-reason").text("Has the backend been shut down?");
    $('#pause').prop("disabled",true);
    $('#play').prop("disabled",true);
    $('#power').prop("disabled",false);
    clearInterval(clockId);
  }
}

function startViz(){
  $.post(BACKEND_URL + "/networks/" + networkname + "/mock").then(
    function(d) {
      startTimer();
      setTimeout(function(){
        initializeVisualisationWithClass(networkname),1000
      })
  }, function(e) {
      $("#error-messages").show();
      $("#error-reason").text("Is the backend running?");
  })
}

function initializeServer(networkname_){
  networkname = networkname_;
  $("#error-messages").hide();
  $.post(BACKEND_URL + "/networks", JSON.stringify({Id: networkname})).then(
    function(d){
      console.log("Backend POST init ok");
      //initializeMocker(networkname_);
      $(".elapsed").show();
      setupEventStream();
    },
    function(e,s,err) {
      $("#error-messages").show();
      $("#error-reason").text("Is the backend running?");
      $('#power').prop("disabled",false);
      $('#play').prop("disabled",true);
      $('#pause').prop("disabled",true);
      console.log("Error sending POST to " + BACKEND_URL + "/networks");
      console.log(e);
    })
};

//Mocker is currently not used for this visualization
function initializeMocker(networkname_) {
  $.post(BACKEND_URL + "/" + networkname_ + "/mockevents/").then(
    function(d){
      console.log("Backend initializeMocker OK");
    },
    function(e){
      console.log("Error initializing mockevents at " + BACKEND_URL + '0/mockevents/');
      console.log(e);
    })
};

function getGraphNodes(arr) {
   return arr.filter(function(i,e){return e.group === 'nodes'})
      .map(function(i,e){
        return {
          id: e.data.id,
          control: e.control,
          visible: true,
          group: 1
       };
      }).toArray();
}

function getGraphLinks(arr) {
  return arr.filter(function(i,e){return e.group === 'edges' && !e.control} )
      .map(function(i,e){
        return {
          id: e.data.id,
          control: e.control,
          source: e.data.source,
          target: e.data.target,
          visible: true,
          group: 1,
          value: i
        };
      }).toArray();
}

function initializeVisualisationWithClass(networkname_){
  this.visualisation = window.visualisation = new P2Pd3(d3.select("#network-visualisation"));
};


function updateVisualisationWithClass(graph) {
  var self = this;

  console.log("Updating visualization with new graph");
  eventHistory.push({timestamp:$("#time-elapsed").text(), content: graph});
  
  var objs = [graph.add, graph.remove, graph.message];
  var act  = [ "ADD", "REMOVE", "MESSAGE" ];
  for (var i=0;i<objs.length; i++) {
    for (var k=0; objs[i] && k<objs[i].length; k++) {
      var obj = objs[i][k];
      var str = act[i] + " - " + obj.group + " Control: " + obj.control + " - " + obj.data.id + "</br>";
      $("#log-console").append(str);
    }
  } 

  $('#node-kademlia-table').addClass("stale");
  //new nodes
  var newNodes = getGraphNodes($(graph.add));
  //new connections 
  var newLinks = getGraphLinks($(graph.add));
  //down nodes
  var removeNodes = getGraphNodes($(graph.remove));
  //down connections 
  var removeLinks = getGraphLinks($(graph.remove));

  visualisation.sidebar.updateSidebarCounts(newNodes, newLinks, removeNodes, removeLinks); 

  var triggerMsgs = $(graph.add)
      .filter(function(i,e){return e.group === 'msgs'})
      .map(function(i,e){
        return {
          source: e.data.source,
          target: e.data.target,
          group: 1,
          value: i
        };
      })
      .toArray();

  self.visualisation.updateVisualisation(newNodes,newLinks,removeNodes,removeLinks,triggerMsgs);
};


