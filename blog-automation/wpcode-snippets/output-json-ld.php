<?php
/**
 * blog-automation で生成したJSON-LD構造化データを、個別記事ページの<head>に出力する。
 * WPCode (Header/Footer または Code Snippets) の「PHPスニペット」として登録し、
 * 実行場所は「サイトワイド ヘッダー」または「wp_head」に設定する。
 */
add_action('wp_head', function () {
    if (!is_single()) {
        return;
    }
    $json_ld = get_post_meta(get_the_ID(), 'blog_automation_json_ld', true);
    if (empty($json_ld)) {
        return;
    }
    // $json_ldはWordPress側でJSON文字列としてそのまま保存されているため、
    // 妥当なJSONであることを検証してから出力する(壊れたHTMLを埋め込まないため)。
    $decoded = json_decode($json_ld);
    if (json_last_error() !== JSON_ERROR_NONE) {
        return;
    }
    echo '<script type="application/ld+json">' . wp_json_encode($decoded) . '</script>' . "\n";
});
