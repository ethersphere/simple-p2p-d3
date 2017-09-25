class P2Pd3Sidebar {

  constructor(selector, viz) {
    this.sidebar = $(selector)
    this.visualisation = viz;
    this.ws = false;
  }

  updateSidebarSelectedNode(data) {
    //reset highlighted links if any
    this.selectNode(data);
    this.selectConnections(data);

    $('#selected-node').show();
    $('#full-node-id').val(data.id);
    $('#node-id').html(nodeShortLabel(data.id));
    $('#node-name').text(data.name);

    if (this.visualisation == Timemachine) {
      return;
    }


    this.getNodeInfo(data.id);
  }

  selectNode(node) {
    for (let n of graphData.nodes) {
      n["color"] = "#ffff99";
    }
    node["color"] = "#f69047";
  }

  updateGraph(node) {
    this.detailView.graphData(this.buildGraphData(node).graphData);
  }

  buildGraphData(node) {
    var nodes = [node];
    var conns = [];
    var nodeSet = new Set();

    for (let c of this.visualisation.graphData.links) {
      if (c.source.id == node.id) {
        conns.push(c);
        nodeSet.add(c.target);
      } else if (c.target.id == node.id) {
        conns.push(c);
        nodeSet.add(c.source);
      }
    }
    for (let n of nodeSet) {
      nodes.push(n);
    }
    detail.graphData = {
      nodes: nodes,
      links: conns,
      msgs:  []
    };
    return detail;
  }

  selectConnections(node) {
    var self = this;
    if (this.detailView) {
      this.detailView = null;
    }
    this.detailView = ForceGraph3D()
                  (document.getElementById("graph-detail"))
                  .graphData(self.buildGraphData(node).graphData);
    this.detailView.width("500");
    this.detailView.height("500");
    $("#graph-detail").addClass("appear");
    /*
    this.detailView.onNodeClick(function(node) {
      self.sidebar.updateSidebarSelectedNode(node);    
    });
    */
  }

  getNodeInfo(nodeId) {
    var classThis = this;
  
    $.ajax({
      url: BACKEND_URL + "/nodes/" + nodeId,
      type: "GET",
      dataType: "json"
      }).then(
        function(d){
          //console.log("Successfully retrieved node info for id: " + nodeId);
          //console.log(d);
          $('#node-kademlia-table').text(d.protocols.hive);
        },
        function(e){
          console.log("Error retrieving node info for id: " + nodeId);
          console.log(e);
        }
    );
    if (this.ws) {
      this.ws.close();
    }
    this.ws = new WebSocket("ws://localhost:8888/nodes/" + nodeId + "/rpc");
    // Connection opened
    this.ws.addEventListener('open', function (event) {
      classThis.ws.send('{"jsonrpc":"2.0","id":1,"method":"hive_healthy","params": [null]}');
    });

    // Listen for messages
    this.ws.addEventListener('message', function (event) {
      //console.log('Message from server', event.data);
      if (event.data) {
        var data = JSON.parse(event.data);
        if (data && data.result !== undefined) {
          var healthy = JSON.parse(event.data).result;
          console.log(healthy);
          if (healthy) {
            $("#healthy").addClass("power-on");
            $("#healthy").removeClass("power-off");
          } else {
            $("#healthy").addClass("power-off");
            $("#healthy").removeClass("power-on");
          } 
          $("#healthy").removeClass("invisible");
        } else {
          console.log("Unexpected error from WS response!");
        }
      }
    });

    // Listen for messages
    this.ws.addEventListener('error', function (event) {
      console.log('Error from server', event.data);
    });
  }

  updateSidebarCounts(nodes, links) {
    $("#nodes-up-count").text(nodes.length);
    $("#edges-up-count").text(links.length);
    $("#edges-remove-count").text(connRemoveCounter);
    $("#edges-add-count").text(connAddCounter);
    $("#nodes-remove-count").text(nodeRemoveCounter);
    $("#nodes-add-count").text(nodeAddCounter);
    $("#msg-count").text(msgCounter);
  }

  resetCounters() {
    eventCounter          = 0;
    msgCounter            = 0;
    nodeAddCounter        = 0;
    nodeRemoveCounter     = 0;
    connAddCounter        = 0;
    connRemoveCounter     = 0;
    $("#nodes-up-count").text("0");
    $("#edges-up-count").text("0");
    $("#nodes-add-count").text("0");
    $("#edges-add-count").text("0");
    $("#nodes-remove-count").text("0");
    $("#edges-remove-count").text("0");
    $("#msg-count").text("0");
  }

  formatNodeHTML(str) {
    return str.replace(/\n/g,"<br/>");
  }

  clearSelection(fromButton) {
    $("#graph-detail").removeClass("appear");
    $("#graph-detail").empty();
    $("#selected-node").hide();
    $("#operation-info").text("");
  }
}

function findNode() {
  $(".sm-dialog").toggle("slow");
}

function getNodeById() {
  let target = getNodeId($("#find-id").val());
  nodeSelected(nodesById[target]);
}

function killLink() {
  disconnectLink();
}

function killNode() {
  var node = $('#full-node-id').val();
  $("#operation-info").text("Killing node. Pending response...");
  $.post(BACKEND_URL + "/nodes/" + node + "/stop").then(
    function(d) {
      console.log("Node successfully stopped");
      sidebar.clearSelection();
    },
    function(e) {
      console.log("Error stopping node");
      $("#operation-info").text("Stopping node failed.");
      console.log(e);
    })
}

function connectTo() {
  operation = "Connect";
  $("#finalizeConnAction").text(operation);
  $("#connect-peer").show("slow");
}

function finalizeConnectTo() {
  var target = $("#target-id").val();
  var source = $("#full-node-id").val();
  target = getNodeId(target);
  $.post(BACKEND_URL + "/nodes/" + source+ "/conn/" + target).then(
    function(d) {
      console.log("Node successfully connected");
    },
    function(e) {
      console.log("Error connecting node");
      console.log(e);
    })
}

function finalizeConnAction() {
  $("#target-id").val($("#peer-id").val());
  if (operation == "Connect") {
    finalizeConnectTo(); 
  } else {
    finalizeDisconnect();
  }
}

function disconnectLink() {
  operation = "Disconnect";
  $("#finalizeConnAction").text(operation);
  $("#connect-peer").show("slow");
}

function finalizeDisconnect() {
  let source = selectedNode.id;
  let target = $("#target-id").val();
  target = getNodeId(target);
  $.ajax({
    url: BACKEND_URL + "/nodes/" + source + "/conn/" + target,
    type: "DELETE",
    data: {},
    contentType:'application/json',
    dataType: 'text', 
    success: function(d) {
      console.log("Edge successfully removed");
    },
    error: function(e) {
      console.log("Error removing edge");
      console.log(e);
    }
  });
}

function getNodeId(node) {
  if (node.length == 64) {
    return node;
  }
  for (let i of graphData.nodes) {
    if (i.name == node) {
      return i.id
    }
  }
}


function generateUID() {
    return ("0000" + (Math.random()*Math.pow(36,4) << 0).toString(36)).slice(-4)
}

function nodeShortLabel(id) {
    return id.substr(0,8);
}

function clearSelection() {
  sidebar.clearSelection(true);
}

function refreshKadTable() {
  sidebar.getNodeInfo($("#full-node-id").val());
}
