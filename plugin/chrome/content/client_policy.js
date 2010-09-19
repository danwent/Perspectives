/* 
 This file implements a lot of the client side policy functionality 
 assuming JSON formatted data.  
*/ 

var Pers_client_policy = { 

sort_number_list_desc : function(list){ 
	function sortNumber(a,b){ return b - a; }
	list.sort(sortNumber); 
}, 


find_key_at_time : function(server_results,desired_time) { 
 for(i = 0; i < server_results.obs.length; i++) { 
		var cur_obs = server_results.obs[i];
		Pers_debug.d_print("policy", "key: " + cur_obs.key); 
		for(j = 0; j < cur_obs.timestamps.length; j++) { 
			var test_end = cur_obs.timestamps[j].end;
			var test_start = cur_obs.timestamps[j].start;
			Pers_debug.d_print("policy", "start: " + test_start + 
						" end: " + test_end); 
			if(desired_time >= test_start && desired_time <= test_end) { 
				return cur_obs.key;  
			}
		} 
 }
 return null; 
}, 

find_most_recent : function(server_results) { 
 var most_recent_time = 0; 
 for(var i = 0; i < server_results.obs.length; i++) { 
		var cur_obs = server_results.obs[i]; 
		for(var j = 0; j < cur_obs.timestamps.length; j++) { 
			var test_time = cur_obs.timestamps[j].end;
			if(test_time > most_recent_time) 
				most_recent_time = test_time; 
		} 
 }
 return most_recent_time; 
}, 

find_oldest_most_recent : function(results, stale_limit_secs,cur_time){
	var stale_limit = cur_time - stale_limit_secs; 
	var oldest_most_recent = cur_time + stale_limit_secs;
	for(var i = 0; i < results.length; i++) { 
		var most_recent = Pers_client_policy.find_most_recent(results[i]);
		if(most_recent && (most_recent < oldest_most_recent)) { 
			if(most_recent > stale_limit) 
				oldest_most_recent = most_recent; 
		}
	}
	return oldest_most_recent; 
}, 


get_num_valid_notaries: function(test_key,results,stale_limit_secs,cur_time){
	var stale_limit = cur_time - stale_limit_secs;
	var num_valid = 0; 
	for(var i = 0; i < results.length; i++) { 
			var mr_time = Pers_client_policy.find_most_recent(results[i]); 
			if(mr_time == 0 || mr_time < stale_limit) {  
				Pers_debug.d_print("policy", "no non-stale keys"); 
				continue;
			}
			var cur_key = Pers_client_policy.find_key_at_time(results[i], mr_time);
			Pers_debug.d_print("policy", "cur_key : " + cur_key); 
			Pers_debug.d_print("policy", "test_key : " + test_key);  
			if(cur_key == test_key) {
				Pers_debug.d_print("policy", "match for server: " + 
						results[i].server); 
				num_valid++; 
			}else { 
				Pers_debug.d_print("policy", "mismatch on most-recent key"); 
			}
	}
	return num_valid; 
}, 

get_all_key_changes : function(results) { 
	var change_set = {}; 
	for(var i = 0; i < results.length; i++) { 
		for(var j = 0; j < results[i].obs.length; j++) { 
			for(var k = 0; k < results[i].obs[j].timestamps.length; k++) { 
				var ts = results[i].obs[j].timestamps[k]; 
				change_set[ts.start] = ""; 
				change_set[ts.end] = ""; 
			}
		}
	}
  	var change_list = []; 
	var x; 
	for (x in change_set) { 
		change_list.push(x); 
	}
	return change_list; 
} , 

check_current_consistency : function(test_key,results,quorum_size,stale_limit_secs,cur_time) {
  	//get_all_key_changes(results); 
	var num_valid = Pers_client_policy.get_num_valid_notaries(test_key,results,stale_limit_secs,cur_time);
	Pers_debug.d_print("policy", 
		"cur_consistency: " + num_valid + " with q = " + quorum_size); 
	return num_valid >= quorum_size; 
}, 

has_quorum_at_time : function(test_key, results, quorum_size, time) {
	Pers_debug.d_print("policy", "testing quorum for time " + time + 
			" and key: " + test_key); 
	var total_valid = 0; 
	for(var i = 0; i < results.length; i++) { 
		if(results[i].obs.length == 0){ 
			Pers_debug.d_print("policy", 
				results[i].server + " has no results"); 
			continue; 
		}
		var cur_key = Pers_client_policy.find_key_at_time(results[i],time); 
		if(cur_key == null) {
			Pers_debug.d_print("policy", results[i].server + " has no key"); 
			continue; 
		}
		if(cur_key == test_key) {
			Pers_debug.d_print("policy", results[i].server + " matched"); 
			total_valid++; 
		}else { 
			Pers_debug.d_print("policy", results[i].server + 
				" had different key: " + cur_key); 
		}
	}
	return total_valid >= quorum_size; 
} , 



get_quorum_duration : function(test_key, results, quorum_size, stale_limit_secs, unixtime) { 

	if(! Pers_client_policy.check_current_consistency(test_key,results,quorum_size,
					stale_limit_secs,unixtime)) { 
		Pers_debug.d_print("policy","current_consistency_failed"); 
		return -1; 
	}
	var oldest_valid_ts = unixtime; 	
	var oldest_most_recent = Pers_client_policy.find_oldest_most_recent(results,unixtime,stale_limit_secs); 
  	var time_changes = Pers_client_policy.get_all_key_changes(results); 
	Pers_client_policy.sort_number_list_desc(time_changes); 
	Pers_debug.d_print("policy", "sorted times: ", time_changes); 
  	var test_time = null; 
	for(var i = 0; i < time_changes.length; i++) {
		test_time = time_changes[i]; 
		if(time_changes[i] > oldest_most_recent) { 
			Pers_debug.d_print("policy","skipping test_time = " + test_time); 
			continue; 
		}
		if(!Pers_client_policy.has_quorum_at_time(test_key,results,quorum_size,test_time)) { 
			Pers_debug.d_print("policy", 
				"quorum failed for time " + test_time); 
			break; 
		}
		oldest_valid_ts = test_time;  
	}
	if(oldest_valid_ts === null) { 
		return 0; 
	} 
	var diff = unixtime - oldest_valid_ts + 1; 
	return (diff > 0) ? diff : 0;  
} 
 

} 
