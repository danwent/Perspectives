    function evtLoad() {
      Perspectives.init_data();
      Perspectives.initNotaries();
      var root_prefs = Components.classes["@mozilla.org/preferences-service;1"]
                                .getService(Components.interfaces.nsIPrefBranch);

      // call this *after* the document has loaded
      // so we have access to the stringbundle from statusbar.xul
      Perspectives.prompt_update();

      var firstrun = root_prefs.getBoolPref("extensions.perspectives.first_run");
      if (firstrun) {
          root_prefs.setBoolPref("extensions.perspectives.first_run", false);
          var bname = "perspectives-status-button";

          if (!document.getElementById(bname)) {
            // user has just installed the extension and has no button. add one
            addToolbarButton("nav-bar", bname, "urlbar-container");
          }
          // else the user has already added the button previously
          // we don't want to touch it
      }

      if(!Perspectives.root_prefs.getBoolPref("extensions.perspectives.show_label")){
        document.getElementById("perspective-statusbar-label").hidden = true;
      }
    }

    // Thanks to Calomel SSL Validation plugin code
    function addToolbarButton(toolbarId, buttonId, beforeId) {
    Pers_debug.d_print("error","Inserting button " + buttonId + " into " + toolbarId + " before beforeId");
    try {
          var firefoxnav = document.getElementById(toolbarId);
          var curSet = firefoxnav.currentSet;
	  var re = new RegExp(beforeId);
          if (curSet.indexOf(buttonId) == -1)
          {
            var set;
            // Place the button before the urlbar
            if (curSet.indexOf(beforeId) != -1){
              set = curSet.replace(re, buttonId + "," + beforeId);
	      Pers_debug.d_print("error", "inserting with RegEx");
	    } else { // at the end
              set = curSet + "," + buttonId;
	      Pers_debug.d_print("error", "inserting at the end");
	    }
            firefoxnav.setAttribute("currentset", set);
            firefoxnav.currentSet = set;
            document.persist(toolbarId, "currentset");
            // If you don't do the following call, funny things happen
            try {
              BrowserToolboxCustomizeDone(true);
            }
            catch (e) { }
          }
        }
        catch(e) { }
    }
/* old non-working version
    function addToolbarButton(toolbarId, buttonId, beforeId) {
        if(!buttonId) {
          Pers_debug.d_print("error",
                    "Could not add Perspectives button to toolbar: "
                    + buttonId + " doesn't exist");
          return;
        }

        if(!toolbarId) {
          Pers_debug.d_print("error",
                    "Could not add Perspectives button to toolbar: "
                    + toolbarId + " doesn't exist");
          return;
        }
        var toolbar = document.getElementById(toolbarId);
        if (toolbar) {
            if (toolbar.firstChild) {
                var before = toolbar.firstChild;
                if (beforeId) {
                    var elem = document.getElementById(beforeId);
                    if (elem) {
                        if (elem.parentNode) {
                            if (elem.parentNode == toolbar) {
                                before = elem;
                            }
                            else {
                                Pers_debug.d_print("error",
                                  "Parent node of " + beforeId +
                                  " is not " + toolbarId);
                            }
                        }
                        else {
                            Pers_debug.d_print("error",
                              "Could not get parent node for " + beforeId);
                        }
                    }
                    else {
                        Pers_debug.d_print("error",
                          "Could not get element " + beforeId + "");
                    }
                }
                else {
                    Pers_debug.d_print("error",
                      "" + beforeId + " doesn't exist.");
                }

                try{
                  toolbar.insertItem(buttonId, before);
                }
                catch(e) {
                  Pers_debug.d_print("error",
                      "Could not add Perspectives button to toolbar:" + e);
                }

                toolbar.setAttribute("currentset", toolbar.currentSet);
                document.persist(toolbar.id, "currentset");

                if (toolbarId == "addon-bar")  {
                    toolbar.collapsed = false;
                }
            }
            else {
              Pers_debug.d_print("error",
                      "Could not add Perspectives button to toolbar: "
                      + ToolbarId + " has no child node");
            }
        }
        else {
          Pers_debug.d_print("error",
                    "Could not add Perspectives button to toolbar: "
                    + toolbarId + " doesn't exist");
        }
    }
*/
