import os
import time
import lhafile
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.select import Select
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

def kyoutei_data_download(download_path, url, start_index, months_count):
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    
    abs_download_path = os.path.abspath(download_path)
    prefs = {
        "download.default_directory": abs_download_path,
        "profile.managed_default_content_settings.images": 2,
        "download.prompt_for_download": False,
    }
    options.add_experimental_option("prefs", prefs)
    
    service = Service(ChromeDriverManager().install())
    browser = webdriver.Chrome(service=service, options=options)
    wait = WebDriverWait(browser, 10)

    try:
        browser.get(url)

        for i in range(start_index, start_index + months_count):
            wait.until(EC.frame_to_be_available_and_switch_to_it((By.NAME, 'menu')))
            dropdown = wait.until(EC.presence_of_element_located((By.NAME, "MONTH")))
            select = Select(dropdown)
            
            if i < len(select.options):
                month_text = select.options[i].text
                select.select_by_index(i)
                print(f"処理中: {month_text} (Index: {i})")
            else:
                browser.switch_to.default_content()
                break
            
            browser.switch_to.default_content()
            wait.until(EC.frame_to_be_available_and_switch_to_it((By.NAME, "JYOU")))
            radios = wait.until(EC.presence_of_all_elements_located((By.XPATH, "//*[@type='radio']")))
            
            for j in range(len(radios)):
                # 現在のファイル数をカウント
                before_count = len(os.listdir(abs_download_path))
                
                radios[j].click()
                btn = browser.find_element(By.XPATH, "//*[@value='ダウンロード開始']")
                btn.click()
                
                # --- 高速監視ロジック ---
                # ファイル数が増えるまで最大3秒待機（増えた瞬間に次へ行く）
                timeout = 0
                while len(os.listdir(abs_download_path)) <= before_count and timeout < 30:
                    time.sleep(0.1) # 0.1秒刻みでチェック
                    timeout += 1
                
            browser.switch_to.default_content()

    except Exception as e:
        print(f"エラーが発生しました: {e}")
    finally:
        # 最後に少しだけ待ってから閉じる（最後のファイルの書き込み完了を確実にするため）
        time.sleep(2)
        browser.quit()

# --- data_kaitou関数と mainブロックは以前と同じ ---

def data_kaitou(download_folder, extract_folder):
    os.makedirs(extract_folder, exist_ok=True)
    if not os.path.exists(download_folder):
        print(f"フォルダ {download_folder} が見つかりません。")
        return
    lzh_files = [f for f in os.listdir(download_folder) if f.endswith('.lzh')]
    if not lzh_files:
        print("解凍対象のLZHファイルが見つかりませんでした。")
        return
    for lzh_name in lzh_files:
        path = os.path.join(download_folder, lzh_name)
        try:
            file = lhafile.Lhafile(path)
            for info in file.infolist():
                with open(os.path.join(extract_folder, info.filename), "wb") as f:
                    f.write(file.read(info.filename))
        except Exception as e:
            print(f"解凍エラー ({lzh_name}): {e}")
    print(f"{len(lzh_files)}個のファイルを解凍しました。")

if __name__ == '__main__':
    target_url = "https://www1.mbrace.or.jp/od2/B/dindex.html"
    dl_dir = "downloaded_lzh2"
    out_dir = "extracted_data2"
    os.makedirs(dl_dir, exist_ok=True)
    print("--- 競艇データ取得スクリプト (高速版) ---")
    try:
        start_idx = int(input("何番目の月（インデックス）から開始しますか？: "))
        how_many_months = int(input("そこから何ヶ月分のデータを取得しますか？: "))
        kyoutei_data_download(dl_dir, target_url, start_idx, how_many_months)
        # data_kaitou(dl_dir, out_dir)
        print("全ての処理が完了しました。")
    except ValueError:
        print("数字を正しく入力してください。")