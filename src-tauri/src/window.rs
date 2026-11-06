use tauri::{PhysicalPosition, WebviewWindow};



pub fn position_top_center(window:&WebviewWindow)-> tauri::Result<()> {
    let Some(monitor) = window.primary_monitor()? else{
        return Ok(());
    };
    
    let monitor_size = monitor.size();
    let monitor_position = monitor.position();
    let window_size = window.outer_size()?;

    let x = monitor_position.x 
        + (monitor_size.width as i32 - window_size.width as i32) / 2;
    let y = monitor_position.y;

window.set_position(PhysicalPosition::new(x,y))
}

