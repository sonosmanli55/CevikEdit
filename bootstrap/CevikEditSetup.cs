// CevikEdit bootstrap installer.
//
// A deliberately tiny Windows launcher (well under 1 MB, .NET Framework 4.x is
// preinstalled on Windows 10/11). It asks the GitHub Releases API for the newest
// release, downloads the real installer next to the release asset and starts it.
// It never writes to the app install directory and never bypasses SmartScreen:
// the downloaded file stays a normal signed-or-unsigned installer the user runs.
//
// Build: npm run bootstrap  (see scripts/build-bootstrap.mjs)

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace CevikEditSetup
{
    internal static class Program
    {
        internal const string Owner = "sonosanli55";
        internal const string Repo = "CevikEdit";
        internal const string ReleasesApi = "https://api.github.com/repos/" + Owner + "/" + Repo + "/releases/latest";
        internal const string ReleasesPage = "https://github.com/" + Owner + "/" + Repo + "/releases/latest";
        internal const string UserAgent = "CevikEdit-Bootstrap/1.0";

        [STAThread]
        private static void Main(string[] args)
        {
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupWindow(args));
        }
    }

    internal sealed class SetupWindow : Form
    {
        private readonly Label _status = new Label();
        private readonly Label _detail = new Label();
        private readonly ProgressBar _progress = new ProgressBar();
        private readonly Button _primary = new Button();
        private readonly Button _cancel = new Button();
        private readonly LinkLabel _link = new LinkLabel();
        private readonly string[] _args;
        private Thread _worker;
        private volatile bool _running;
        private string _installer;
        private string _version = "";

        public SetupWindow(string[] args)
        {
            _args = args ?? new string[0];
            Text = "CevikEdit kurulum";
            ClientSize = new Size(520, 258);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(18, 21, 24);
            ForeColor = Color.FromArgb(232, 236, 239);
            Font = new Font("Segoe UI", 9.25f);

            var title = new Label();
            title.Text = "CevikEdit";
            title.Font = new Font("Segoe UI Semibold", 17f);
            title.ForeColor = Color.FromArgb(143, 245, 230);
            title.AutoSize = true;
            title.Location = new Point(24, 20);
            Controls.Add(title);

            var subtitle = new Label();
            subtitle.Text = "Kurulum hazırlanıyor · en son sürüm GitHub'dan indirilir";
            subtitle.ForeColor = Color.FromArgb(150, 158, 168);
            subtitle.AutoSize = true;
            subtitle.Location = new Point(26, 58);
            Controls.Add(subtitle);

            _status.Text = "Sürüm bilgisi alınıyor…";
            _status.AutoSize = false;
            _status.Size = new Size(468, 22);
            _status.Location = new Point(26, 104);
            Controls.Add(_status);

            _progress.Location = new Point(26, 130);
            _progress.Size = new Size(468, 12);
            _progress.Style = ProgressBarStyle.Continuous;
            Controls.Add(_progress);

            _detail.Text = "Bu kurucu yalnızca son sürümü indirir; projeleriniz ve medyanız yüklenmez.";
            _detail.AutoSize = false;
            _detail.Size = new Size(468, 38);
            _detail.ForeColor = Color.FromArgb(139, 146, 156);
            _detail.Location = new Point(26, 150);
            Controls.Add(_detail);

            _primary.Text = "İndiriliyor…";
            _primary.Enabled = false;
            _primary.Size = new Size(150, 34);
            _primary.Location = new Point(344, 202);
            _primary.BackColor = Color.FromArgb(66, 212, 199);
            _primary.ForeColor = Color.FromArgb(6, 33, 31);
            _primary.FlatStyle = FlatStyle.Flat;
            _primary.FlatAppearance.BorderSize = 0;
            _primary.Click += delegate { PrimaryClick(); };
            Controls.Add(_primary);

            _cancel.Text = "İptal";
            _cancel.Size = new Size(96, 34);
            _cancel.Location = new Point(236, 202);
            _cancel.FlatStyle = FlatStyle.Flat;
            _cancel.FlatAppearance.BorderColor = Color.FromArgb(58, 62, 70);
            _cancel.Click += delegate { Close(); };
            Controls.Add(_cancel);

            _link.Text = "Sürüm notları";
            _link.AutoSize = true;
            _link.LinkColor = Color.FromArgb(143, 245, 230);
            _link.Location = new Point(26, 210);
            _link.LinkClicked += delegate { OpenPage(); };
            Controls.Add(_link);

            Shown += delegate { StartDownload(); };
            FormClosing += delegate { _running = false; };
        }

        private void PrimaryClick()
        {
            if (_installer != null)
            {
                Launch(_installer);
                return;
            }
            StartDownload();
        }

        private void StartDownload()
        {
            if (_running) return;
            _running = true;
            _installer = null;
            _primary.Enabled = false;
            _status.Text = "Sürüm bilgisi alınıyor…";
            _progress.Value = 0;
            _worker = new Thread(new ThreadStart(delegate
            {
                try
                {
                    string url = FindInstaller();
                    string target = Path.Combine(Path.GetTempPath(), "CevikEdit-kurulum-" + _version + ".exe");
                    Download(url, target);
                    _installer = target;
                    Ui(delegate
                    {
                        _status.Text = "CevikEdit " + _version + " indirildi";
                        _detail.Text = "Kurulumu başlatmak için butona basın. Kurulum sırasında CevikEdit kapanır.";
                        _primary.Text = "Kur";
                        _primary.Enabled = true;
                        _link.Text = "Kurulum dosyasını göster";
                        _link.LinkClicked += delegate { Process.Start("explorer.exe", "/select,\"" + _installer + "\""); };
                    });
                    if (HasArg("--run"))
                        Ui(delegate { Launch(target); });
                }
                catch (Exception error)
                {
                    Ui(delegate
                    {
                        _status.Text = "İndirme tamamlanamadı";
                        _detail.Text = error.Message;
                        _primary.Text = "Yeniden dene";
                        _primary.Enabled = true;
                    });
                }
                finally
                {
                    _running = false;
                    Ui(delegate { if (_installer == null) _primary.Enabled = true; });
                }
            }));
            _worker.IsBackground = true;
            _worker.Start();
        }

        private string FindInstaller()
        {
            using (var client = new WebClient())
            {
                client.Headers.Add("User-Agent", Program.UserAgent);
                client.Headers.Add("Accept", "application/vnd.github+json");
                string json = client.DownloadString(Program.ReleasesApi);
                var tag = Regex.Match(json, "\"tag_name\"\\s*:\\s*\"([^\"]+)\"");
                if (!tag.Success) throw new InvalidOperationException("Sürüm bilgisi okunamadı.");
                _version = tag.Groups[1].Value.TrimStart('v');
                Ui(delegate { _status.Text = "CevikEdit " + _version + " indiriliyor…"; });

                var matches = Regex.Matches(json, "\"browser_download_url\"\\s*:\\s*\"([^\"]+)\"");
                var candidates = new List<string>();
                foreach (Match match in matches)
                {
                    string url = match.Groups[1].Value;
                    if (!url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) continue;
                    if (!(url.IndexOf("github.com", StringComparison.OrdinalIgnoreCase) >= 0 ||
                          url.IndexOf("githubusercontent.com", StringComparison.OrdinalIgnoreCase) >= 0))
                        continue;
                    if (url.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) candidates.Add(url);
                }
                if (candidates.Count == 0) throw new InvalidOperationException("Bu sürüm için Windows kurulum dosyası bulunamadı.");
                foreach (string url in candidates)
                    if (url.IndexOf("Setup", StringComparison.OrdinalIgnoreCase) >= 0) return url;
                return candidates[0];
            }
        }

        private void Download(string url, string target)
        {
            if (File.Exists(target)) File.Delete(target);
            using (var client = new WebClient())
            {
                client.Headers.Add("User-Agent", Program.UserAgent);
                client.DownloadProgressChanged += delegate (object sender, DownloadProgressChangedEventArgs e)
                {
                    Ui(delegate
                    {
                        _progress.Value = Math.Max(0, Math.Min(100, e.ProgressPercentage));
                        _status.Text = "İndiriliyor… %" + e.ProgressPercentage;
                    });
                };
                var done = new ManualResetEventSlim();
                Exception failure = null;
                client.DownloadFileCompleted += delegate (object sender, System.ComponentModel.AsyncCompletedEventArgs e)
                {
                    failure = e.Error;
                    done.Set();
                };
                client.DownloadFileAsync(new Uri(url), target);
                done.Wait();
                if (failure != null) throw failure;
            }
            var info = new FileInfo(target);
            if (!info.Exists || info.Length < 1024 * 1024)
                throw new InvalidOperationException("İndirilen kurulum dosyası beklenenden küçük.");
        }

        private void Launch(string file)
        {
            var answer = MessageBox.Show(
                this,
                "CevikEdit " + _version + " kurulumu başlatılsın mı?\n\nKurulum sırasında uygulama kapanır. Kaydedilmemiş çalışmalarınız için önce kaydetmeniz önerilir.",
                "CevikEdit kurulum",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);
            if (answer != DialogResult.Yes) return;
            try
            {
                Process.Start(new ProcessStartInfo(file) { UseShellExecute = true });
                Close();
            }
            catch (Exception error)
            {
                MessageBox.Show(this, "Kurulum başlatılamadı: " + error.Message, "CevikEdit", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void OpenPage()
        {
            try { Process.Start(new ProcessStartInfo(Program.ReleasesPage) { UseShellExecute = true }); }
            catch { /* offline is fine */ }
        }

        private bool HasArg(string name)
        {
            foreach (string arg in _args)
                if (string.Equals(arg, name, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        private void Ui(Action action)
        {
            if (IsDisposed) return;
            if (InvokeRequired) BeginInvoke(action);
            else action();
        }
    }
}
