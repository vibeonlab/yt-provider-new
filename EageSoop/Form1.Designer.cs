using System.Windows.Forms;

namespace EageSoop
{
    partial class Form1
    {
        /// <summary>
        /// 必需的设计器变量。
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// 清理所有正在使用的资源。
        /// </summary>
        /// <param name="disposing">如果应释放托管资源，为 true；否则为 false。</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows 窗体设计器生成的代码



        private System.Windows.Forms.Panel panelUrlInput;
        private System.Windows.Forms.TextBox txtUrlInput;
        private System.Windows.Forms.Button btnNavigate;
        private System.Windows.Forms.Panel panelButtons;
        private System.Windows.Forms.Button btnAddTab;
        private System.Windows.Forms.Button btnRemoveTab;
        private System.Windows.Forms.Button btnClearDiskCache;
        private System.Windows.Forms.Button btnReduceMemory;
        private System.Windows.Forms.Label lblLastMemoryReleaseTime;
        private System.Windows.Forms.Label lblLastMemoryReleaseMessage;
        private System.Windows.Forms.Label lblDiskCacheSize;
        private System.Windows.Forms.TextBox txtAgentName;
        private System.Windows.Forms.Button btnSetAgentName;
        private System.Windows.Forms.TabControl tabControl1;

        /// <summary>
        /// 设计器支持所需的方法 - 不要修改
        /// 使用代码编辑器修改此方法的内容。
        /// </summary>
        private void InitializeComponent()
        {
            this.panelUrlInput = new System.Windows.Forms.Panel();
            this.txtUrlInput = new System.Windows.Forms.TextBox();
            this.btnNavigate = new System.Windows.Forms.Button();
            this.panelButtons = new System.Windows.Forms.Panel();
            this.txtAgentName = new System.Windows.Forms.TextBox();
            this.btnSetAgentName = new System.Windows.Forms.Button();
            this.btnAddTab = new System.Windows.Forms.Button();
            this.btnRemoveTab = new System.Windows.Forms.Button();
            this.btnClearDiskCache = new System.Windows.Forms.Button();
            this.btnReduceMemory = new System.Windows.Forms.Button();
            this.lblLastMemoryReleaseTime = new System.Windows.Forms.Label();
            this.lblLastMemoryReleaseMessage = new System.Windows.Forms.Label();
            this.lblDiskCacheSize = new System.Windows.Forms.Label();
            this.tabControl1 = new System.Windows.Forms.TabControl();
            this.panelUrlInput.SuspendLayout();
            this.panelButtons.SuspendLayout();
            this.SuspendLayout();
            // 
            // panelUrlInput
            // 
            this.panelUrlInput.BackColor = System.Drawing.Color.LightSkyBlue;
            this.panelUrlInput.Controls.Add(this.txtUrlInput);
            this.panelUrlInput.Controls.Add(this.btnNavigate);
            this.panelUrlInput.Dock = System.Windows.Forms.DockStyle.Top;
            this.panelUrlInput.Location = new System.Drawing.Point(0, 0);
            this.panelUrlInput.Name = "panelUrlInput";
            this.panelUrlInput.Padding = new System.Windows.Forms.Padding(5);
            this.panelUrlInput.Size = new System.Drawing.Size(1280, 45);
            this.panelUrlInput.TabIndex = 2;
            // 
            // txtUrlInput
            // 
            this.txtUrlInput.Dock = System.Windows.Forms.DockStyle.Fill;
            this.txtUrlInput.Font = new System.Drawing.Font("微软雅黑", 14.25F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(134)));
            this.txtUrlInput.Location = new System.Drawing.Point(5, 5);
            this.txtUrlInput.Name = "txtUrlInput";
            this.txtUrlInput.Size = new System.Drawing.Size(1190, 39);
            this.txtUrlInput.TabIndex = 0;
            // 
            // btnNavigate
            // 
            this.btnNavigate.Dock = System.Windows.Forms.DockStyle.Right;
            this.btnNavigate.Location = new System.Drawing.Point(1195, 5);
            this.btnNavigate.Name = "btnNavigate";
            this.btnNavigate.Size = new System.Drawing.Size(80, 35);
            this.btnNavigate.TabIndex = 1;
            this.btnNavigate.Text = "Go";
            this.btnNavigate.Click += new System.EventHandler(this.BtnNavigate_Click);
            // 
            // panelButtons
            // 
            this.panelButtons.BackColor = System.Drawing.Color.LightSkyBlue;
            this.panelButtons.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.panelButtons.Controls.Add(this.txtAgentName);
            this.panelButtons.Controls.Add(this.btnSetAgentName);
            this.panelButtons.Controls.Add(this.btnAddTab);
            this.panelButtons.Controls.Add(this.btnRemoveTab);
            this.panelButtons.Controls.Add(this.btnClearDiskCache);
            this.panelButtons.Controls.Add(this.btnReduceMemory);
            this.panelButtons.Controls.Add(this.lblLastMemoryReleaseTime);
            this.panelButtons.Controls.Add(this.lblLastMemoryReleaseMessage);
            this.panelButtons.Controls.Add(this.lblDiskCacheSize);
            this.panelButtons.Dock = System.Windows.Forms.DockStyle.Top;
            this.panelButtons.Location = new System.Drawing.Point(0, 45);
            this.panelButtons.Name = "panelButtons";
            this.panelButtons.Padding = new System.Windows.Forms.Padding(5);
            this.panelButtons.Size = new System.Drawing.Size(1280, 68);
            this.panelButtons.TabIndex = 1;
            // 
            // txtAgentName
            // 
            this.txtAgentName.Location = new System.Drawing.Point(875, 10);
            this.txtAgentName.Name = "txtAgentName";
            this.txtAgentName.Size = new System.Drawing.Size(280, 27);
            this.txtAgentName.TabIndex = 2;
            // 
            // btnSetAgentName
            // 
            this.btnSetAgentName.Location = new System.Drawing.Point(1161, 9);
            this.btnSetAgentName.Name = "btnSetAgentName";
            this.btnSetAgentName.Size = new System.Drawing.Size(100, 26);
            this.btnSetAgentName.TabIndex = 3;
            this.btnSetAgentName.Text = "设置程序名称";
            this.btnSetAgentName.UseVisualStyleBackColor = true;
            this.btnSetAgentName.Click += new System.EventHandler(this.BtnSetAgentName_Click);
            // 
            // btnAddTab
            // 
            this.btnAddTab.AutoSize = true;
            this.btnAddTab.Location = new System.Drawing.Point(10, 9);
            this.btnAddTab.Name = "btnAddTab";
            this.btnAddTab.Size = new System.Drawing.Size(94, 30);
            this.btnAddTab.TabIndex = 0;
            this.btnAddTab.Text = "Add Tab";
            this.btnAddTab.Click += new System.EventHandler(this.BtnAddTab_Click);
            // 
            // btnRemoveTab
            // 
            this.btnRemoveTab.AutoSize = true;
            this.btnRemoveTab.Location = new System.Drawing.Point(110, 9);
            this.btnRemoveTab.Name = "btnRemoveTab";
            this.btnRemoveTab.Size = new System.Drawing.Size(115, 30);
            this.btnRemoveTab.TabIndex = 1;
            this.btnRemoveTab.Text = "Remove Tab";
            this.btnRemoveTab.Click += new System.EventHandler(this.BtnRemoveTab_Click);
            // 
            // btnClearDiskCache
            // 
            this.btnClearDiskCache.AutoSize = true;
            this.btnClearDiskCache.Location = new System.Drawing.Point(231, 9);
            this.btnClearDiskCache.Name = "btnClearDiskCache";
            this.btnClearDiskCache.Size = new System.Drawing.Size(94, 30);
            this.btnClearDiskCache.TabIndex = 7;
            this.btnClearDiskCache.Text = "清理缓存";
            this.btnClearDiskCache.UseVisualStyleBackColor = true;
            this.btnClearDiskCache.Click += new System.EventHandler(this.BtnClearDiskCache_Click);
            // 
            // btnReduceMemory
            // 
            this.btnReduceMemory.AutoSize = true;
            this.btnReduceMemory.Location = new System.Drawing.Point(336, 9);
            this.btnReduceMemory.Name = "btnReduceMemory";
            this.btnReduceMemory.Size = new System.Drawing.Size(112, 30);
            this.btnReduceMemory.TabIndex = 4;
            this.btnReduceMemory.Text = "低内存模式";
            this.btnReduceMemory.UseVisualStyleBackColor = true;
            this.btnReduceMemory.Click += new System.EventHandler(this.BtnReduceMemory_Click);
            // 
            // lblLastMemoryReleaseTime
            // 
            this.lblLastMemoryReleaseTime.AutoSize = true;
            this.lblLastMemoryReleaseTime.Font = new System.Drawing.Font("微软雅黑", 8.25F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(134)));
            this.lblLastMemoryReleaseTime.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(64)))), ((int)(((byte)(64)))), ((int)(((byte)(64)))));
            this.lblLastMemoryReleaseTime.Location = new System.Drawing.Point(458, 8);
            this.lblLastMemoryReleaseTime.Name = "lblLastMemoryReleaseTime";
            this.lblLastMemoryReleaseTime.Size = new System.Drawing.Size(94, 20);
            this.lblLastMemoryReleaseTime.TabIndex = 5;
            this.lblLastMemoryReleaseTime.Text = "上次切换：—";
            // 
            // lblLastMemoryReleaseMessage
            // 
            this.lblLastMemoryReleaseMessage.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.lblLastMemoryReleaseMessage.AutoEllipsis = true;
            this.lblLastMemoryReleaseMessage.Font = new System.Drawing.Font("微软雅黑", 8.25F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(134)));
            this.lblLastMemoryReleaseMessage.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(96)))), ((int)(((byte)(96)))), ((int)(((byte)(96)))));
            this.lblLastMemoryReleaseMessage.Location = new System.Drawing.Point(458, 26);
            this.lblLastMemoryReleaseMessage.Name = "lblLastMemoryReleaseMessage";
            this.lblLastMemoryReleaseMessage.Size = new System.Drawing.Size(405, 17);
            this.lblLastMemoryReleaseMessage.TabIndex = 6;
            this.lblLastMemoryReleaseMessage.Text = "当前为正常模式，点击左侧「低内存模式」可切换。";
            // 
            // lblDiskCacheSize
            // 
            this.lblDiskCacheSize.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.lblDiskCacheSize.AutoEllipsis = true;
            this.lblDiskCacheSize.Font = new System.Drawing.Font("微软雅黑", 8.25F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(134)));
            this.lblDiskCacheSize.ForeColor = System.Drawing.Color.FromArgb(((int)(((byte)(70)))), ((int)(((byte)(70)))), ((int)(((byte)(120)))));
            this.lblDiskCacheSize.Location = new System.Drawing.Point(10, 46);
            this.lblDiskCacheSize.Name = "lblDiskCacheSize";
            this.lblDiskCacheSize.Size = new System.Drawing.Size(853, 17);
            this.lblDiskCacheSize.TabIndex = 8;
            this.lblDiskCacheSize.Text = "磁盘缓存（估算）：— MB（启动后自动刷新）";
            // 
            // tabControl1
            // 
            this.tabControl1.Dock = System.Windows.Forms.DockStyle.Fill;
            this.tabControl1.Location = new System.Drawing.Point(0, 113);
            this.tabControl1.Name = "tabControl1";
            this.tabControl1.SelectedIndex = 0;
            this.tabControl1.Size = new System.Drawing.Size(1280, 747);
            this.tabControl1.TabIndex = 0;
            this.tabControl1.SelectedIndexChanged += new System.EventHandler(this.TabControl1_SelectedIndexChanged);
            // 
            // Form1
            // 
            this.ClientSize = new System.Drawing.Size(1280, 860);
            this.Controls.Add(this.tabControl1);
            this.Controls.Add(this.panelButtons);
            this.Controls.Add(this.panelUrlInput);
            this.Font = new System.Drawing.Font("微软雅黑", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(134)));
            this.Name = "Form1";
            this.Text = "Soop Web";
            this.Load += new System.EventHandler(this.Form1_Load);
            this.panelUrlInput.ResumeLayout(false);
            this.panelUrlInput.PerformLayout();
            this.panelButtons.ResumeLayout(false);
            this.panelButtons.PerformLayout();
            this.ResumeLayout(false);

        }

        #endregion
    }
}

