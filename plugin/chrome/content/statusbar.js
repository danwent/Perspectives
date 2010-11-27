var Pers_statusbar = {
	STATE_ERROR : -1,
	STATE_SEC   : 0,
	STATE_NSEC  : 1,
	STATE_NEUT  : 2,
	STATE_QUERY  : 3,

	force_update : function(event) {
		Perspectives.forceStatusUpdate(window); 
	},

	statusbar_click: function(event) {
		Pers_statusbar.open_results_dialog();
	},

	// note: when debugging, it is useful to open this dialog as a 
	// window, so we get a firebug console, etc
	open_results_dialog: function() { 
		window.openDialog(
	//	window.open( // for debug
			"chrome://perspectives/content/results_dialog.xul", 
	//        	"perspectivesResults", "").focus();  // for debug
			"perspectivesresults", "centerscreen, chrome, toolbar").focus();

	},

	// note: when debugging, it is useful to open this dialog as a 
	// window, so we get a firebug console, etc
	open_preferences_dialog: function() { 
		window.openDialog(
	// 	window.open( // for debug
			"chrome://perspectives/content/preferences_dialog.xul", 
	//       	"perspectivesResults", "").focus();  // for debug
			"perspectivepreferences", "centerscreen, chrome, toolbar").focus();

	},


	setStatus: function(uri,state, tooltip){
		if(uri != null && uri != window.gBrowser.currentURI) { 
		//	Pers_debug.d_print("main", "Ignoring setStatus for '" + uri.spec + 
		//	"' because current browser tab is for '" + 
		//	window.gBrowser.currentURI.spec + "'"); 
			return;  
		}
		if(!tooltip){
			tooltip = "Perspectives";
		}

		var i = document.getElementById("perspective-status-image");
		var t = document.getElementById("perspective-status");
		if(!t || !i){ //happens when called from a dialog
			i = window.opener.document.
				getElementById("perspective-status-image");
			t = window.opener.document.getElementById("perspective-status");
		}

		t.setAttribute("tooltiptext", tooltip);
		switch(state){
		case Pers_statusbar.STATE_SEC:
			Pers_debug.d_print("main", "Secure Status\n");
			i.setAttribute("src", "chrome://perspectives/content/good.png");
			break;
		case Pers_statusbar.STATE_NSEC:
			Pers_debug.d_print("main", "Unsecure Status\n");
			i.setAttribute("src", "chrome://perspectives/content/bad.png");
			break;
		case Pers_statusbar.STATE_NEUT:
			Pers_debug.d_print("main", "Neutral Status\n");
			i.setAttribute("src", "chrome://perspectives/content/default.png");
			break;
		case Pers_statusbar.STATE_QUERY:
			Pers_debug.d_print("main", "Querying Status\n");
			i.setAttribute("src", "chrome://perspectives/content/progress.gif");
			break;
		case Pers_statusbar.STATE_ERROR:
			Pers_debug.d_print("main", "Error Status\n");
			i.setAttribute("src", "chrome://perspectives/content/error.png");
			break;
		}
		Pers_debug.d_print("main", "changing tooltip to: " + tooltip + "\n"); 
		return true;
	},

	openCertificates: function(){
		openDialog("chrome://pippki/content/certManager.xul", 
			"Certificate Manager");
	},

	//Should open new window because the dialog prevents them from seeing it
	openNotaries: function(){
		openDialog("chrome://perspectives_main/content/http_notary_list.txt", 
			"", "width=600,height=600,resizable=yes");
	},

	openHelp: function(){
		openDialog("chrome://perspectives_main/content/help.html","",
			"width=600,height=600,resizable=yes");
	}
}
