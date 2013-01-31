/**
 * Toolbar which can contain other views. Has two areas, left and right.
 */
define(
	[
		'emberjs',
		'text!neos/templates/content/ui/pageTree.html',
		'text!neos/templates/content/ui/deletePageDialog.html',
		'jquery.dynatree'
	], function(Ember, pageTreeTemplate, deletePageDialogTemplate) {
		if (window._requirejsLoadingTrace) window._requirejsLoadingTrace.push('neos/content/ui/elements/page-tree');

		return Ember.View.extend({
			classNames: ['t3-pagetree', 't3-ui'],
			template: Ember.Handlebars.compile(pageTreeTemplate),
			tree: null,
			editNodeTitleMode: false,
			isDblClick: false,

			didInsertElement: function() {
				if (this.tree) {
					return;
				}
				var that = this,
					pageMetaInformation = $('#t3-page-metainformation'),
					siteRootNodePath = pageMetaInformation.data('__siteroot'),
					pageNodePath = $('#t3-page-metainformation').attr('about');

				that.tree = this.$('#t3-dd-pagetree').dynatree({
					keyboard: true,
					minExpandLevel: 1,
					classNames: {
						title: 'dynatree-title'
					},
					clickFolderMode: 1,
					debugLevel: 0, // 0: quiet, 1: normal, 2: debug
					strings: {
						loading: 'Loading…',
						loadError: 'Load error!'
					},
					children: [
						{
							title: pageMetaInformation.data('__sitename'),
							key: pageMetaInformation.data('__siteroot'),
							isFolder: true,
							expand: false,
							isLazy: true,
							select: false,
							active: false,
							unselectable: true,
							addClass: 'typo3_neos_contenttypes-root'
						}
					],
					dnd: {
						autoExpandMS: 1000,
						preventVoidMoves: true, // Prevent dropping nodes 'before self', etc.

						/**
						 * Executed on beginning of drag.
						 * Returns false to cancel dragging of node.
						 */
						onDragStart: function(node) {
							if (node.data.key !== siteRootNodePath) {
								return true;
							} else {
								// the root node should not be draggable
								return false;
							}
						},

						/**
						 * sourceNode may be null for non-dynatree droppables.
						 * Return false to disallow dropping on node. In this case
						 * onDragOver and onDragLeave are not called.
						 * Return 'over', 'before, or 'after' to force a hitMode.
						 * Return ['before', 'after'] to restrict available hitModes.
						 * Any other return value will calc the hitMode from the cursor position.
						 */
						onDragEnter: function(node, sourceNode) {
							return true;
						},

						onDragOver: function(node, sourceNode, hitMode) {
							if (node.isDescendantOf(sourceNode)) {
								return false;
							}
						},

						/**
						 * This function MUST be defined to enable dropping of items on
						 * the tree.
						 *
						 * hitmode over, after and before
						 * !sourcenode = new Node
						 */
						onDrop: function(node, sourceNode, hitMode, ui, draggable) {
							var position = hitMode === 'over' ? 'into' : hitMode;
							sourceNode.move(node, hitMode);

							TYPO3_Neos_Service_ExtDirect_V1_Controller_NodeController.move(
								sourceNode.data.key,
								node.data.key,
								position,
								function(result) {
									if (result !== null && result.success === true) {
										T3.ContentModule.loadPage(node.data.href);
									} else {
										T3.Common.notification.error('Unexpected error while moving node: ' + JSON.stringify(result));
									}
								}
							);
						}
					},

					/**
					 * The following callback is executed if an lazy-loading node
					 * has not yet been loaded.
					 *
					 * It might be executed multiple times in rapid succession,
					 * and needs to take care itself that it only fires one
					 * ExtDirect request per node at a time. This is implemented
					 * using node._currentlySendingExtDirectAjaxRequest.
					 */
					onLazyRead: function(node) {
						if (node._currentlySendingExtDirectAjaxRequest) {
							return;
						}
						node._currentlySendingExtDirectAjaxRequest = true;
						TYPO3_Neos_Service_ExtDirect_V1_Controller_NodeController.getChildNodesForTree(
							node.data.key,
							'TYPO3.TYPO3CR:Folder',
							0,
							function(result) {
								node._currentlySendingExtDirectAjaxRequest = false;
								if (result !== null && result.success === true) {
									node.setLazyNodeStatus(DTNodeStatus_Ok);
									node.addChild(result.data);
								} else {
									node.setLazyNodeStatus(DTNodeStatus_Error);
									T3.Common.Notification.error('Page Tree loading error.');
								}
								if (node.getLevel() === 1) {
									that.tree.dynatree('getTree').activateKey(pageNodePath);
								}
							}
						);
					},

					onClick: function(node, event) {
						if (that.editNodeTitleMode === true) {
							return false;
						}
						// only if the node title was clicked
						// and it was not active at this time
						// it should be navigated to the target node
						if (node.data.key !== siteRootNodePath && (node.getEventTargetType(event) === 'title' || node.getEventTargetType(event) === 'icon')) {
							setTimeout(function() {
								if (!that.isDblClick) {
									T3.ContentModule.loadPage(node.data.href);
								}
							}, 300);
						}
					},

					onDblClick: function(node, event) {
						if (node.getEventTargetType(event) === 'title' && node.getLevel() !== 1) {
							that.isDblClick = true;
							setTimeout(function() {
								that.isDblClick = false;
								that.editNode(node);
							}, 300);
						}
					},

					onKeydown: function(node, event) {
						switch( event.which ) {
							case 113: // [F2]
								that.editNode(node);
								return false;
							case 13: // [enter]
								that.editNode(node);
								return false;
						}
					}
				});

				// Automatically expand the first node when opened
				that.tree.dynatree('getRoot').getChildren()[0].expand(true);

				// Handles click events when a page title is in editmode so clicks on other pages leads not to reloads
				this.$('#t3-dd-pagetree').click(function() {
					if (that.editNodeTitleMode === true) {
						return false;
					}
				});

				// Adding a new page by clicking on the newPage container, if a page is active
				this.$('#t3-action-newpage').click(function() {
					var activeNode = that.$('#t3-dd-pagetree').dynatree('getActiveNode');
					if (activeNode !== null) {
						that.createAndEditNode(activeNode);
					} else {
						T3.Common.Notification.notice('You have to select a page');
					}
					return false;
				});

				// Deleting a page by clicking on the deletePage container, if a page is active
				this.$('#t3-action-deletepage').click(function() {
					var activeNode = that.$('#t3-dd-pagetree').dynatree('getActiveNode');
					if (activeNode !== null) {
						if (activeNode.data.key !== siteRootNodePath) {
							that.showDeletePageDialog(activeNode);
						} else {
							T3.Common.Notification.notice('The Root page cannot be deleted.');
						}
					} else {
						T3.Common.Notification.notice('You have to select a page');
					}
				});
			},

			/**
			 * When clicking the delete Page, we show a dialog
			 */
			showDeletePageDialog: function(activeNode) {
				var that = this,
					view = Ember.View.create({
						template: Ember.Handlebars.compile(deletePageDialogTemplate),
						pageTitle: activeNode.data.title,
						numberOfChildren: activeNode.data.children ? activeNode.data.children.length : 0,
						didInsertElement: function() {
						},
						cancel: function() {
							view.destroy();
						},
						'delete': function() {
							that.deleteNode(activeNode);
							view.destroy();
						}
					});
				view.appendTo('#t3-pagetree-container');
			},

			editNode: function(node) {
				var prevTitle = node.data.title,
					tree = node.tree,
					that = this;

				that.editNodeTitleMode = true;
				tree.$widget.unbind();

				$('.dynatree-title', node.span).html($('<input />').attr({id: 'editNode', value: prevTitle}));

				// Focus <input> and bind keyboard handler
				$('input#editNode').focus().keydown(function(event) {
					switch (event.which) {
						case 27: // [esc]
							// discard changes on [esc]
							$('input#editNode').val(prevTitle);
							$(this).blur();
							break;
						case 13: // [enter]
							// simulate blur to accept new value
							$(this).blur();
							break;
					}
				}).blur(function(event) {
						// Accept new value, when user leaves <input>
						var newTitle = $('input#editNode').val(),
							title;
						// Re-enable mouse and keyboard handling
						tree.$widget.bind();
						node.focus();

						if (prevTitle === newTitle || newTitle === '') {
							title = prevTitle;
							that.editNodeTitleMode = false;
						} else {
							title = newTitle;
						}

						if (that.editNodeTitleMode === true) {
							that.editNodeTitleMode = false;
							TYPO3_Neos_Service_ExtDirect_V1_Controller_NodeController.update(
								{
									__contextNodePath: node.data.key,
									title: title
								},
								function(result) {
									if (result !== null && result.success === true) {
										that.editNodeTitleMode = false;
										node.focus();
										tree.$widget.bind();
										T3.ContentModule.loadPage(node.data.href);
									} else {
										T3.Common.notification.error('Unexpected error while updating node: ' + JSON.stringify(result));
									}
								}
							);
						}
						that.editNodeTitleMode = false;
						node.setTitle(title);
						node.focus();
					});
			},
			createAndEditNode: function(activeNode) {
				var that = this,
					position = 'into',
					node = activeNode.addChild({
						title: '[New Page]',
						contentType: 'TYPO3.Neos.ContentTypes:Page',
						addClass: 'typo3_neos_contenttypes-page',
						expand: true
					}),
					prevTitle = node.data.title,
					tree = node.tree;
				that.editNodeTitleMode = true;
				tree.$widget.unbind();

				$('.dynatree-title', node.span).html($('<input />').attr({id: 'editCreatedNode', value: prevTitle}));
				// Focus <input> and bind keyboard handler
				$('input#editCreatedNode').focus().select().keydown(function(event) {
					switch (event.which) {
						case 27: // [esc]
							// discard changes on [esc]
							$('input#editNode').val(prevTitle);
							$(this).blur();
							break;
						case 13: // [enter]
							// simulate blur to accept new value
							$(this).blur();
							break;
					}
				}).blur(function(event) {
						var newTitle = $('input#editCreatedNode').val(),
							title;

						// Accept new value, when user leaves <input>
						if (prevTitle === newTitle || newTitle === '') {
							title = prevTitle;
						} else {
							title = newTitle;
						}
						// Hack for Chrome and Safari, otherwise two pages will be created, because .blur fires one request with two datasets
						if (that.editNodeTitleMode) {
							that.editNodeTitleMode = false;
							node.activate();
							node.setTitle(title);
							TYPO3_Neos_Service_ExtDirect_V1_Controller_NodeController.createNodeForTheTree(
								activeNode.data.key,
								{
									contentType: 'TYPO3.Neos.ContentTypes:Page',
									//@todo give a unique nodename from the title
									properties: {
										title: title
									}
								},
								position,
								function(result) {
									if (result !== null && result.success === true) {
										// Actualizing the created dynatree node
										node.data.key = result.data.key;
										node.data.name = result.data.name;
										node.data.title = result.data.title;
										node.data.href = result.data.href;
										node.data.isFolder = result.data.isFolder;
										node.data.isLazy = result.data.isLazy;
										node.data.contentType = result.data.contentType;
										node.data.expand = result.data.expand;
										node.data.addClass = result.data.addClass;

										// Re-enable mouse and keyboard handling
										tree.$widget.bind();
										T3.ContentModule.loadPage(node.data.href);
									} else {
										T3.Common.notification.error('Unexpected error while creating node: ' + JSON.stringify(result));
									}
								}
							);
						}
					});
			},

			deleteNode: function(node) {
				TYPO3_Neos_Service_ExtDirect_V1_Controller_NodeController['delete'](
					node.data.key,
					function(result) {
						if (result !== null && result.success === true) {
							var parentNode = node.getParent();
							parentNode.focus();
							parentNode.activate();
							node.remove();
							T3.ContentModule.loadPage(parentNode.data.href);
						} else {
							T3.Common.notification.error('Unexpected error while deleting node: ' + JSON.stringify(result));
						}
					}
				);
			}

		});

	}
);