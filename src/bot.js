const { Browser, Builder, until, By } = require("selenium-webdriver");
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const mv = promisify(fs.rename);
const mkdir = promisify(fs.mkdir);

// Configurações
const CONFIG = {
    BASE_DIR: path.join(__dirname, 'empresas'),
    DOWNLOAD_PATH: path.join(require('os').homedir(), 'Downloads'),
    WAIT_TIMEOUT: 10000,
    SHORT_WAIT: 5000,
    NAVIGATION_DELAY: 2000,
    PAGE_LOAD_DELAY: 20000
};

// Tipos de documentos com seus seletores e prefixos
const DOCUMENT_TYPES = {
    ALVARA: {
        button: '//*[@id="formDetalhePortalTransparencia:codigoTipoServicoPortalEmpresaLocalizar"]/div[2]/ul/li[2]',
        download: '//*[@id="formDetalhePortalTransparencia:dtAlvarasFuncionamento:0:j_idt171"]',
        prefix: 'alvara'
    },
    ISENCAO_LICENCIAMENTO: {
        button: '//*[@id="formDetalhePortalTransparencia:codigoTipoServicoPortalEmpresaLocalizar"]/div[2]/ul/li[3]',
        download: '//*[@id="formDetalhePortalTransparencia:dtLicenciamentos:0:j_idt218"]',
        prefix: 'isencao_licenciamento'
    },
    ISENCAO_PLANO: {
        button: '//*[@id="formDetalhePortalTransparencia:codigoTipoServicoPortalEmpresaLocalizar"]/div[2]/ul/li[4]',
        download: '//*[@id="formDetalhePortalTransparencia:dtIsencoesPlanos:0:j_idt428"]',
        prefix: 'isencao_plano'
    },
    LICENCA_SANITARIA: {
        button: '//*[@id="formDetalhePortalTransparencia:codigoTipoServicoPortalEmpresaLocalizar"]/div[2]/ul/li[5]',
        download: '//*[@id="formDetalhePortalTransparencia:dtLicencasSanitarias:0:j_idt306"]',
        prefix: 'licenca_sanitaria'
    }
};

class FileManager {
    static async organizeFiles(cnpj, downloadedFile, fileType = '') {
        const companyDir = path.join(CONFIG.BASE_DIR, cnpj);
        
        if (!fs.existsSync(companyDir)) {
            await mkdir(companyDir, { recursive: true });
        }
        
        const fileExt = path.extname(downloadedFile);
        const newFileName = fileType ? `${cnpj}_${fileType}${fileExt}` : `${cnpj}${fileExt}`;
        const newFilePath = path.join(companyDir, newFileName);
        
        await mv(
            path.join(CONFIG.DOWNLOAD_PATH, downloadedFile),
            newFilePath
        );
        
        return newFilePath;
    }

    static async waitForDownload(initialFiles, timeout = 60000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const currentFiles = fs.readdirSync(CONFIG.DOWNLOAD_PATH);
            const newFiles = currentFiles.filter(file => !initialFiles.includes(file));
            
            for (const file of newFiles) {
                const filePath = path.join(CONFIG.DOWNLOAD_PATH, file);
                const statsBefore = fs.statSync(filePath);
                await new Promise(resolve => setTimeout(resolve, 1000));
                const statsAfter = fs.statSync(filePath);
                
                if (statsBefore.size === statsAfter.size && statsBefore.size > 0) {
                    return file;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        throw new Error('Timeout ao aguardar download');
    }
}

class PortalInteractor {
    constructor(driver) {
        this.driver = driver;
    }

    async navigateToEnterpriseSection() {
        await this.driver.get("https://portal.seuma.fortaleza.ce.gov.br/fortalezaonline/portal/portaltransparencia.jsf");
        console.log("Access: " + await this.driver.getTitle());
        await this.driver.sleep(CONFIG.NAVIGATION_DELAY);
        
        const enterpriseButton = await this.driver.wait(
            until.elementLocated(By.xpath('//*[@id="tvTransparencia"]/ul/li[2]/a')),
            CONFIG.WAIT_TIMEOUT
        );
        await enterpriseButton.click();
        console.log("Enterprise button clicked");
    }

    async searchByCNPJ(cnpj) {
        const writeCNPJ = await this.driver.wait(
            until.elementLocated(By.xpath('//*[@id="tvTransparencia:formPortalTransparenciaEmpresa:cnpjEstabelecimento"]')),
            CONFIG.WAIT_TIMEOUT
        );
        await writeCNPJ.clear();
        await writeCNPJ.sendKeys(cnpj);
        console.log("CNPJ escrito: " + cnpj);

        const searchButton = await this.driver.wait(
            until.elementLocated(By.xpath('//*[@id="tvTransparencia:formPortalTransparenciaEmpresa:btnLocalizarPesquisarEmpresas"]')),
            CONFIG.WAIT_TIMEOUT
        );
        await this.driver.executeScript("arguments[0].scrollIntoView(true);", searchButton);
        await this.driver.wait(until.elementIsEnabled(searchButton), CONFIG.WAIT_TIMEOUT);
        await searchButton.click();
        console.log("Botão de busca clicado para CNPJ: " + cnpj);

        await this.driver.sleep(CONFIG.NAVIGATION_DELAY);
    }

    async openEnterpriseDetails() {
        try {
            const detailsButton = await this.driver.wait(
                until.elementLocated(By.xpath('//*[@id="tvTransparencia:formPortalTransparenciaEmpresa:dtListaEmpresas:0:row2"]')),
                CONFIG.SHORT_WAIT
            );
            if (detailsButton) {
                await detailsButton.click();
                return true;
            }
        } catch (error) {
            return false;
        }
    }

    async downloadDocument(documentType) {
        try {
            const docConfig = DOCUMENT_TYPES[documentType];
            const button = await this.driver.wait(
                until.elementLocated(By.xpath(docConfig.button)),
                CONFIG.WAIT_TIMEOUT
            );
            
            if (button) {
                await button.click();
                console.log(`Botão de ${documentType} clicado`);

                const downloadButton = await this.driver.wait(
                    until.elementLocated(By.xpath(docConfig.download)),
                    CONFIG.WAIT_TIMEOUT
                );
                await downloadButton.click();
                console.log(`Botão de download de ${documentType} clicado`);

                return docConfig.prefix;
            }
        } catch (error) {
            console.error(`Botão de ${documentType} não encontrado`);
            return null;
        }
    }

    async closeDetails() {
        const closeButton = await this.driver.wait(
            until.elementLocated(By.xpath('//*[@id="formDetalhePortalTransparencia:dlgDetalhesPortalTransparencia"]/div[1]/a')),
            CONFIG.WAIT_TIMEOUT
        );
        await closeButton.click();
        console.log("Botão de fechar detalhes clicado");
    }
}

async function processCNPJ(driver, cnpj) {
    const portal = new PortalInteractor(driver);
    const initialFiles = fs.readdirSync(CONFIG.DOWNLOAD_PATH);

    try {
        await portal.searchByCNPJ(cnpj);
        
        if (!await portal.openEnterpriseDetails()) {
            console.log("Botão de detalhes não encontrado para CNPJ: " + cnpj + ". Pulando...");
            return;
        }

        await driver.sleep(CONFIG.PAGE_LOAD_DELAY);

        // Processa todos os tipos de documentos
        for (const docType of Object.keys(DOCUMENT_TYPES)) {
            const prefix = await portal.downloadDocument(docType);
            if (prefix) {
                try {
                    const downloadedFile = await FileManager.waitForDownload(initialFiles);
                    if (downloadedFile) {
                        const newPath = await FileManager.organizeFiles(cnpj, downloadedFile, prefix);
                        console.log(`Arquivo salvo em: ${newPath}`);
                    }
                } catch (downloadError) {
                    console.error(`Erro ao processar download do ${docType}:`, downloadError);
                }
            }
        }

        await portal.closeDetails();
        await driver.sleep(CONFIG.NAVIGATION_DELAY);
    } catch (error) {
        console.error("Erro ao processar CNPJ " + cnpj + ":", error.message);
    }
}

async function run() {
    if (!fs.existsSync(CONFIG.BASE_DIR)) {
        await mkdir(CONFIG.BASE_DIR, { recursive: true });
    }

    const driver = await new Builder()
        .forBrowser(Browser.CHROME)
        .build();

    try {
        const portal = new PortalInteractor(driver);
        await portal.navigateToEnterpriseSection();
        
        const cnpjList = [
            "07556271000177",
            // Adicione outros CNPJs aqui
        ];

        for (const cnpj of cnpjList) {
            await processCNPJ(driver, cnpj);
        }
    } finally {
        await driver.quit();
    }
}

run().catch(err => console.error("Error running the bot:", err));