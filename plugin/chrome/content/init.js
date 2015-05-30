/*
*   This file is part of the Perspectives Firefox Client
*
*   Copyright (C) 2011 Dan Wendlandt
*
*   This program is free software: you can redistribute it and/or modify
*   it under the terms of the GNU General Public License as published by
*   the Free Software Foundation, version 3 of the License.
*
*   This program is distributed in the hope that it will be useful,
*   but WITHOUT ANY WARRANTY; without even the implied warranty of
*   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
*   GNU General Public License for more details.
*
*   You should have received a copy of the GNU General Public License
*   along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

// This file contains initialization code that may be run when the extension starts
// It is held separately from initialize.xul to comply with Mozilla review policies

    function evtLoad(evt){
      Perspectives.init_data();
      Perspectives.initNotaries();
      var root_prefs = Components.classes["@mozilla.org/preferences-service;1"]
                                .getService(Components.interfaces.nsIPrefBranch);

      // call this *after* the document has loaded
      // so we have access to the stringbundle from statusbar.xul
      Perspectives.prompt_update();

      var firstrun = root_prefs.getBoolPref("perspectives.first_run");
      if (firstrun) {
          root_prefs.setBoolPref("perspectives.first_run", false);
          var bname = "perspectives-status-button";

          if (!document.getElementById(bname)) {
            // user has just installed the extension and has no button. add one
            addToolbarButton("nav-bar", bname, "urlbar-container");
          }
          // else the user has already added the button previously
          // we don't want to touch it
      }

      if(!Perspectives.root_prefs.getBoolPref("perspectives.show_label")){
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
