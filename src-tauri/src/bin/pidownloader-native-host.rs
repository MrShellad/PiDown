fn main() {
    if let Err(error) = app_lib::run_native_host() {
        eprintln!("PiDownloader native host failed: {error}");
        std::process::exit(1);
    }
}
