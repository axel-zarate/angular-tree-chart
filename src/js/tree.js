(function (angular, $, undefined) {
	var module = angular.module("AxelSoft", []);

	module.value("treeChartDefaults", {
		draggable: true,
		nodesProperty: "nodes",
		displayProperty: "name",
		collapsible: true
	});

	module.factory("RecursionHelper", ["$compile", function($compile){
		return {
			/**
			 * Manually compiles the element, fixing the recursion loop.
			 * @param element
			 * @param [link] A post-link function, or an object with function(s) registered via pre and post properties.
			 * @returns An object containing the linking functions.
			 */
			compile: function(element, link){
				// Normalize the link parameter
				if(angular.isFunction(link)){
					link = { post: link };
				}

				// Break the recursion loop by removing the contents
				var contents = element.contents().remove();
				var compiledContents;
				return {
					pre: (link && link.pre) ? link.pre : null,
					/**
					 * Compiles and re-adds the contents
					 */
					post: function(scope, element){
						// Compile the contents
						if(!compiledContents){
							compiledContents = $compile(contents);
						}
						// Re-add the compiled contents to the element
						compiledContents(scope, function(clone){
							element.append(clone);
						});

						// Call the post-linking function, if any
						if(link && link.post){
							link.post.apply(null, arguments);
						}
					}
				};
			}
		};
	}]);

	module.directive("treeChart", ["$compile", "treeChartDefaults", function ($compile, treeChartDefaults) {
		return {
			restrict: "A",
			scope: {
				tree: "=treeChart",
				options: "=treeChartOptions"
			},
			template: '<div class="tree-chart-wrap">' +
					'<div class="tree-chart">' +
						'<ul>' +
							'<li tree-chart-node="tree">' +
							'</li>' +
						'</ul>' +
					'</div>'+
				'</div>',
			controller: ["$scope", "$q", function ($scope, $q) {
				var self = this,
					selectedScope,
					selectedNode;

				var options = angular.extend({}, treeChartDefaults, $scope.options);
				if (options.draggable && !(typeof $.fn.draggable === "function" && typeof $.fn.droppable === "function")) {
					throw new Error("Draggable option requires jQuery UI Draggable");
				}

				self.selectNode = function (scope, node, breadcrumbs) {

					selectedScope = scope;
					selectedNode = node;
					$scope.hasSelection = true;
					$scope.isNodeSelected = true;

					if (typeof options.onNodeSelect === "function") {
						options.onNodeSelect(node);
					}
				};

				self.isSelected = function (node) {
					return node === selectedNode;
				};

				self.getOptions = function () {
					return options;
				};

				$scope.add = function (event) {
					event.preventDefault();

					if (!$scope.isNodeSelected) return;

					options.onAdd(selectedNode);
				};

				$scope.remove = function (event) {
					event.preventDefault();

					if (!$scope.hasSelection) return;

					var selected = selectedNode;
					$q.when(options.onRemove(selected, selectedScope.$parent.node || $scope.treeChart), function (result) {
						if (result === false) return;
						selectedScope = undefined;
						selectedNode = undefined;
						$scope.hasSelection = false;
						$scope.isNodeSelected = false;
					});
				};

				$scope.canAdd = typeof options.onAdd === "function";
				$scope.canRemove = typeof options.onRemove === "function";
			}]
		};
	}]);

	module.directive("treeChartNode", ["$compile", "RecursionHelper", function ($compile, RecursionHelper) {
		return {
			restrict: "A",
			require: "^treeChart",
			scope: {
				node: "=treeChartNode",
				parentNode: "=treeChartNodeParent"
			},
			replace: true,
			template: '<li>' +
				'<div class="node" ng-click="selectNode($event)">' +
					'{{ getDisplayName() }}' +
				'</div>' +
				'<ul ng-show="hasChildren()">' +
					'<li tree-chart-node="child" tree-chart-node-parent="node" ng-repeat="child in getChildren()">' +
					'</li>' +
				'</ul>' +
			'</li>',
			compile: function(element) {
				// Use the compile function from the RecursionHelper,
				// And return the linking function(s) which it returns
				return RecursionHelper.compile(element, function (scope, element, attrs, controller, transclude) {

					var options = controller.getOptions(),
						nodesProperty = options.nodesProperty,
						displayProperty = options.displayProperty,
						collapsible = options.collapsible,
						draggable = options.draggable;

					var selectedNode;
					var node = scope.node;

					// scope.parentNode = scope.$parent.$eval(attrs.treeNodeParent);
					scope.expanded = collapsible == false;

					scope.hasChildren = function () {
						return Boolean(node && (node[nodesProperty] && node[nodesProperty].length));
					};

					scope.getChildren = function () {
						return node && node[nodesProperty];
					};
					
					scope.getDisplayName = function () {
						return scope.$eval("node." + displayProperty);
					};

					scope.selectNode = function (event) {
						event.preventDefault();

						if (collapsible) {
							toggleExpanded();
						}

						if (scope.isSelected()) return;

						selectedNode = event.currentTarget;
						controller.selectNode(scope, node);
					};
					
					scope.removeNode = function (child) {
						if (scope.hasChildren()) {
							var index = node[nodesProperty].indexOf(child);
							if (index >= 0) {
								node[nodesProperty].splice(index, 1);
							}
						}
					};
					
					scope.addNodes = function (nodes) {
						if (!node[nodesProperty]) {
							node[nodesProperty] = [];
						}
						for (var i = 0; i < nodes.length; i++) {
							node[nodesProperty].push(nodes[i]);
						}
						
					};

					scope.isSelected = function () {
						return controller.isSelected(node);
					};

					function toggleExpanded() {
						scope.expanded = !scope.expanded;
					}
					
					function acceptDrop(otherScope) {
						var otherNode = otherScope.node;
						scope.addNodes([otherNode]);
						otherScope.$parent.removeNode(otherNode);
						// var children = otherScope.getChildren();
						// if (children && children.length) {
							// otherScope.$parent.addNodes(children);
							// children.length = 0;
						// }
						scope.$apply();
					}
					
					// Checks if the node for the current scope is a child of the specified node
					function isNodeAChildOf(otherNode) {
						var children = otherNode[nodesProperty];
						if (angular.isArray(children)) {
							for (var i = 0; i < children.length; i++) {
								var child = children[i];
								if(node == child){
									return true;
								}
								var result = isNodeAChildOf(child);
								if(result){
									return true;
								}
							}
						}
						return false;
					}

					if (options.draggable) {
						var div = element.children("div.node");
						div.draggable({
							cursor: "move",
							distance: 40,
							zIndex: 5,
							helper: "clone",
							opacity: 0.8,
							start: function(event, ui) {
								if (!scope.parentNode) {
									return false;
								}
								return true;
							}
						});
						div.droppable({
							accept: ".tree-chart div.node",
							drop: function (event, ui) {
								var draggedScope = ui.draggable.scope();
								if(isNodeAChildOf(draggedScope.node)){
									// A parent node is dropped on this node. Do nothing.
									return;
								}
								if (draggedScope.parentNode == node) {
									// Trying to drop into direct parent node. Do nothing.
									return;
								}
								acceptDrop(draggedScope);
							}
						});
						div.disableSelection();
					}
				});
			}
		};
	}]);

})(angular, jQuery);