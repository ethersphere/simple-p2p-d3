class P2Pd3Sidebar {

  constructor(selector, viz) {
    this.sidebar = $(selector)
    this.visualisation = viz;
    this.ws = false;
  }

  updateSidebarSelectedNode(data) {
    //reset highlighted links if any
    this.visualisation.linkCollection
      .attr("stroke", "#808080")
      .attr("stroke-width", 1.5)
      .classed("stale",false);

    var selectedNode = $(this.sidebar).find('#selected-node');
    selectedNode.addClass('node-selected');
    selectedNode.find('#full-node-id').val(data.id);
    selectedNode.find('#node-id').html(nodeShortLabel(data.id));
    selectedNode.find('#node-index').html(data.index);
    this.selectConnections(data.id);
    if (this.visualisation == Timemachine) {
      return;
    }
    $(".node-bar").css({"visibility":"visible"});
    //selectedNode.find('.node-balance').html(data.balance);

    this.getNodeInfo(data.id);
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
    this.ws = new WebSocket("ws://localhost:8888/network/nodes/" + nodeId + "/rpc");
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

  updateSidebarCounts() {
    $("#nodes-up-count").text(this.visualisation.graphNodes?this.visualisation.graphNodes.length:"0");
    $("#edges-up-count").text(this.visualisation.graphLinks?this.visualisation.graphLinks.length:"0");
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

  selectConnections(id) {
    var self = this;
    //set node links to "foreground" (no opacity)
    var conns         = this.visualisation.nodesById[id];
    this.visualisation.linkCollection.classed("stale", true);
    var connSelection = this.visualisation.linkCollection.filter(function(n) {
      return conns.indexOf(n.id) > -1;
    });
    connSelection
          .attr("stroke", "#f69047")
          .attr("stroke-width", 2.5)
          .classed("stale", false);

    //set node link targets to "foreground" (no opacity)
    this.visualisation.nodeCollection.classed("stale", true);
    var targets       = [];
    for (var k=0;k<conns.length;k++) {
      var c = this.visualisation.connsById[conns[k]];
      if (c.target == id) {
        targets.push(c.source);
      } else {
        targets.push(c.target);
        //targets.push(this.visualisation.connsById[conns[k]].target);
      }
    }
    var nodesSelection = this.visualisation.nodeCollection.filter(function(n) {
      return targets.indexOf(n.id) > -1 || n.id == id;
    });
    nodesSelection.classed("stale", false);
    selectionActive = true;
  }

  clearSelection(fromButton) {
    this.visualisation.linkCollection
      .attr("stroke", "#808080")
      .attr("stroke-width", 1.5)
      .classed("stale", false);
    this.visualisation.nodeCollection.classed("stale", false);
    if (fromButton) {
      $("circle").removeClass("selected");
      $("#node-kademlia-table").text("");
      $('#kad-hint').addClass("invisible");
    }
    selectionActive = false;
  }
}

function getNodeById() {
  visualisation.sidebar.getNodeInfo($("#full-node-id").val());
}

function killLink() {
  selectDisconnect = true;
  $("body").css({"cursor": "crosshair"});
}

function killNode() {
  var node = $('#full-node-id').val();
  $.post(BACKEND_URL + "/nodes/" + node + "/stop").then(
    function(d) {
      console.log("Node successfully stopped");
      $('#kad-hint').addClass("invisible");
    },
    function(e) {
      console.log("Error stopping node");
      console.log(e);
    })
}

function connectTo() {
  $("body").css({"cursor": "crosshair"});
  selectingTarget = true;
}

function finalizeConnectTo() {
  $("body").css({"cursor": "default"});
  selectingTarget = false;
  var target = $("#target-id").val();
  var source = $("#full-node-id").val();
  $.post(BACKEND_URL + "/nodes/" + source+ "/conn/" + target).then(
    function(d) {
      console.log("Node successfully connected");
    },
    function(e) {
      console.log("Error connecting node");
      console.log(e);
    })
}

function disconnectLink(id) {
  var conn = visualisation.connsById[id];
  //$.ajax(options);
  $.ajax({
    url: BACKEND_URL + "/nodes/" + conn.source+ "/conn/" + conn.target,
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
  selectDisconnect = false;
  $("body").css({"cursor": "default"});
}


class P2Pd3 {
  constructor(svg) {
	  this.updatecount = 0;
    this.width = svg.attr("width");
    this.height = svg.attr("height");
    this.svg = svg;

    this.resetObjects();

    this.skipCollectionSetup = false;

    this.nodeRadius = 16;
    this.color = d3.scaleOrdinal(d3.schemeCategory20);
    this.sidebar = new P2Pd3Sidebar('#sidebar', this);
  }

  resetObjects() {
    this.graphNodes = [];
    this.graphLinks = [];
    this.graphMsgs = [];
    //for convenience; this may (or should) be "merged" with graphNodes
    this.nodesById = {};
    this.connsById = {};
    this.connCounter = {};
    this.sources = [];
  }

  linkDistance(d) {
    //return Math.floor(Math.random() * 11) + 400;
    //return (d.distance / 20) * 100;
    //console.log(d.distance * 100);
    return d.distance * 100;
  }

  // increment callback function during simulation
  ticked(link,node) {
    var self = this;
    link
        .attr("x1", function(d) { return d.source.x; })
        .attr("y1", function(d) { return d.source.y; })
        .attr("x2", function(d) { return d.target.x; })
        .attr("y2", function(d) { return d.target.y; });

    node
        .attr("cx", function(d) { return d.x = Math.max(self.nodeRadius, Math.min(self.width - self.nodeRadius, d.x)); })
        .attr("cy", function(d) { return d.y = Math.max(self.nodeRadius, Math.min(self.height - self.nodeRadius, d.y)) });
  }

  // event callbacks
  dragstarted(simulation,d) {
    if (!d3.event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  dragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
  }

  dragended(simulation,d) {
    if (!d3.event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
  // end event callbacks

  initialize() {
    if (this.initialized) {
      return;
    }
    var self = this;

    var simulation = this.simulation = d3.forceSimulation(self.graphNodes)
        .force("link", d3.forceLink().id(function(d) { return d.id; }))
        .force("charge", d3.forceManyBody(+10))
        .force("center", d3.forceCenter(self.width / 2, self.height / 2))
        //.force("x", d3.forceX())
        //.force("y", d3.forceY())
        .alphaDecay(0)
        .alphaMin(0)
        .on("tick", function(){ self.ticked(self.linkCollection, self.nodeCollection) });

    if (!this.skipCollectionSetup) {
      this.setupLinks();
      this.setupNodes();
    }

    simulation.force("link")
        .links(this.graphLinks)
        //.distance(function(l,i){return 80;});
        .distance(self.linkDistance);

    this.initialized = true;
  }

  setupLinks(){
    this.linkCollection = this.svg.append("g")
        .attr("class", "links")
        .selectAll(".link");
  }

  setupNodes() {
    this.nodeCollection = this.svg.append("g")
        .attr("class", "nodes")
        .attr("stroke", "#fff").attr("stroke-width", 1.5)
        .selectAll(".node");
  }


  updateVisualisation(graph) {
    var self = this;

  	this.updatecount++;
    this.nodesChanged = false;
    this.linksChanged = false;
    this.animateMessages = false;

    this.appendNodes(graph.newNodes);
    this.removeNodes(graph.removeNodes);
    this.appendLinks(graph.newLinks);
    this.removeLinks(graph.removeLinks);

    this.msg = this.processMsgs(graph.messages);

    if (!this.initialized) {
      this.initialize();
    }

    this.sidebar.updateSidebarCounts();
    //console.log(this.graphNodes);
    //console.log(this.graphLinks);
    this.restartSimulation();
  }

  restartSimulation() {
    // Update and restart the simulation.
    var self = this;
    if (this.linksChanged) {
      // Apply the general update pattern to the links.
      this.linkCollection = this.linkCollection.data(this.graphLinks);
      this.linkCollection.exit().remove();
      this.linkCollection = this.linkCollection
          .enter()
          .append("line")
          .attr("stroke", "#808080")
          .attr("stroke-width", 1.5)
          .on("click", function(d) {
            if (selectDisconnect) {
             disconnectLink(d.id);
            }
          })
          .merge(this.linkCollection);
      if (selectionActive) {
        this.sidebar.clearSelection(false);
        this.sidebar.selectConnections($("#full-node-id").val());
      }
    }

    //this allows lines to reflect amount of messages
    //currently disabled
    //this.linkCollection.attr("stroke-width", function(d) { return 1.5 + ((parseInt(self.connsById[d.id].msgCount / 3) -1) / 2)  }); //increase in steps of 0.5

    // Apply the general update pattern to the nodes.
    if (this.nodesChanged) {
      this.nodeCollection = this.nodeCollection.data(this.graphNodes);
      // Apply class "existing-node" to all existing nodes
      this.nodeCollection.attr("fill","#ae81ff");
      // Remove all old nodes
      this.nodeCollection.exit().remove();
      // Apply to all new nodes (enter selection)
      this.nodeCollection = this.nodeCollection
          .enter()
          .append("circle")
          .attr("fill", "#46bc99")
          .attr("r", this.nodeRadius)
          .on("click", function(d) {
            if(selectingTarget) {
              $("#target-id").val(d.id);
              finalizeConnectTo();
            } else {
              //deselect
              self.nodeCollection.classed("selected", function(p) { return p.selected =  p.previouslySelected = false; })
              //select
              d3.select(this).classed("selected",true);
              self.sidebar.updateSidebarSelectedNode(d);
            }

          })
          .call(d3.drag()
              .on("start", function(d){ self.dragstarted(self.simulation, d); } )
              .on("drag", function(d){ self.dragged(d); } )
              .on("end", function(d){ self.dragended(self.simulation, d); } ))
          .merge(this.nodeCollection);
    }


    if (this.animateMessages && this.msg.length) {
      var self = this;
      this.msgCollection = this.linkCollection.filter(function(n) {
        return self.msg[0].id == n.id;
      });
      this.msgCollection
        .classed("highlight",true);
      setTimeout(this.resetMsgCollection, 1000);
    }

    this.simulation.nodes(self.graphNodes);
    this.simulation.force("link").links(self.graphLinks);
    this.simulation.force("center", d3.forceCenter(self.width/2, self.height/2));
    this.simulation.alpha(1).restart();
  }

  resetMsgCollection() {
    if (!this.msgCollection) return;
    this.msgCollection.classed("highlight",false);
  }

  appendNodes(nodes){
    if (!nodes.length) { return }

    for (var i=0; i<nodes.length; i++) {
      //console.log("NEW node: " + nodes[i].id);
      this.nodesById[nodes[i].id] = [];
      this.graphNodes.push(nodes[i]);
      nodeAddCounter += 1;
    }
    this.nodesChanged = true;
  }

  removeNodes(nodes){
    if (!nodes.length) { return }
    var self = this;

    //console.log("REMOVE node: " + nodes[0].id);
    this.graphNodes = this.graphNodes.filter(function(n){
        var contained = false;
        for (var k=0; k<nodes.length; k++) {
          if (n.id == nodes[k].id) {
            contained = true;
            delete self.nodesById[nodes[k].id];
            break;
          }
          nodeRemoveCounter += 1;
        }
        return contained == false;
    });
    this.nodesChanged = true;
  }

  appendLinks(links){
    if (!links.length) { return }

    var self = this;
    for (var i=0;i<links.length;i++) {
      var id     = links[i].id;
      var source = links[i].source;
      var target = links[i].target;
      var selectedNode = $("#full-node-id").val();
      if (selectedNode == links[i].source || selectedNode == links[i].target) {
        self.updateKadTable(selectedNode);
      }
      //The following is a hack to hedge against incoming connections to/from
      //non-existing nodes. It was happening regularly due to some backend bug.
      //CURRENTLY DISABLED AS IT SEEMS NOT TO BE HAPPENING FOR THE TIME BEING.
      /*
      var srcmatch = false;
      var trgmatch = false;
      for (var k=0; k<this.graphNodes.length; k++) {
        var nid = this.graphNodes[k].id
        if (nid == source) {
          srcmatch = true;
        }
        if (nid == target) {
          trgmatch = true;
        }
        if (srcmatch && trgmatch) {
          break;
        }
      }
      //don't try adding connections to non-existing nodes...
      if (!srcmatch || !trgmatch) {
          return
      }
      */
      this.nodesById[target].push(id);
      this.nodesById[source].push(id);

      this.connsById[id] = {};
      this.connsById[id].target   = links[i].target;
      this.connsById[id].source   = links[i].source;
      this.connsById[id].msgCount = 0;
      if (! this.connCounter[id]) {
        this.connCounter[id] = {};
        this.connCounter[id].msgCount = 0;
        this.connCounter[id].connCount= 0;
      };
      this.connCounter[id].connCount += 1;
      if (this.sources.indexOf(links[i].source) == -1) {
        this.sources.push(links[i].source);
      }
      connAddCounter += 1;
    }
    this.graphLinks = this.graphLinks.concat(links);
    //console.log("ADD connection, source: " + source+ " - target: " + target );
    this.linksChanged = true;
  }

  updateKadTable(nodeId) {
    this.sidebar.getNodeInfo(nodeId);
    console.log("Kad table of selected Node updated");
  }

  removeLinks(links){
    if (!links.length) { return }

    var self = this;
    this.graphLinks= this.graphLinks.filter(function(n){
        var contained = false
        for (var k=0; k<links.length; k++) {
          if (n.id == links[k].id) {
            contained = true;
            //n.visible = false;
            var selectedNode = $("#full-node-id").val();
            if (selectedNode == links[k].source || selectedNode == links[k].target) {
              self.updateKadTable(selectedNode);
            }
            var s = links[k].source;
            var t = links[k].target;
            var j = self.nodesById[s].indexOf(n.id);
            if (j>-1) {
              self.nodesById[s].splice(j, 1);
            }
            j = self.nodesById[t].indexOf(n.id);
            if (j>-1) {
              self.nodesById[t].splice(j, 1);
            }
            connRemoveCounter += 1;
            break;
          }
        }
        return contained == false ;
    });
    this.linksChanged = true;
  }

	processMsgs(msgs){
    if (!msgs || !msgs.length) { return msgs }

    for (var i=0;i<msgs.length;i++) {
      var id = msgs[i].id;
      if (this.connsById[id]) {
        this.connsById[id].msgCount += 1;
        this.connCounter[id].msgCount += 1;
      } else {
        console.log("WARN: got message for connection which does not exist in simulation!");
      }
      msgCounter += 1;
    }
    return msgs;
	}


  generateUID() {
    return ("0000" + (Math.random()*Math.pow(36,4) << 0).toString(36)).slice(-4)
  }

  // we need an index instead for this, if too many nodes will be too slow
  getConnByNodes(sourceid,targetid) {
	  for (var i = 0; i < this.graphLinks.length; i++) {
		  if (sourceid === this.graphLinks[i].source.id && targetid === this.graphLinks[i].target.id) {
			  return i;
		  }
	  }
	  return -1;
  }

}

function generateUID() {
    return ("0000" + (Math.random()*Math.pow(36,4) << 0).toString(36)).slice(-4)
}

function nodeShortLabel(id) {
    return id.substr(0,8);
}

function clearSelection() {
  visualisation.sidebar.clearSelection(true);
}

function refreshKadTable() {
  visualisation.sidebar.getNodeInfo($("#full-node-id").val());
}
