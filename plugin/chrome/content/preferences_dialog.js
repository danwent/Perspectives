var Pers_pref = {
	root_prefs : Components.classes["@mozilla.org/preferences-service;1"].
				getService(Components.interfaces.nsIPrefBranch),

	disable_quorum_text: function(is_disabled) { 
		document.getElementById("quorum-thresh-text").disabled=is_disabled;
		document.getElementById("quorum-duration-text").disabled=is_disabled; 
	}, 

	menuset: function(qu, du){
		Pers_pref.disable_quorum_text(true); 
		document.getElementById("quorum-thresh").value = qu;
		document.getElementById("quorum-duration").value = du;
	},

	security_class_change: function() {
		var setting  = document.getElementById("secset").value;

		switch (parseInt(setting)){
		case 2:
			Pers_pref.menuset(75, 2);
			break;
		case 1:
			Pers_pref.menuset(75, 0);
			break;
		case 0:
			Pers_pref.menuset(50, 0);
			break;
		case -1:
			Pers_pref.disable_quorum_text(false); 
			break;
		}

	},

        save_button_clicked: function() {
	   try {  
		var add_list = document.getElementById("additional_notary_list");
		var l = Pers_util.loadNotaryListFromString(add_list.value); 
		window.close()
		return true; 
	   } catch (e) { 
		alert("Perspectives Error: " + e);
		return false;  
	   } 
	}, 
  
	load_preferences: function(){
		try { 
			Pers_pref.security_class_change(); 
			var default_notary_text = Pers_util.readFileFromURI("chrome://perspectives/content/http_notary_list.txt");  
			document.getElementById("default_notary_list").value = default_notary_text;
		} catch(e) { 
			alert("Perspectives Error: " + e); 
		} 
	}
}

